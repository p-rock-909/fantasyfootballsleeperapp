#!/usr/bin/env python3
"""
Session Memory - Cross-session context persistence for Claude agents.

Stores agent insights, decisions, and context across sessions using SQLite.
Integrates with MBIE for hybrid documentation + session memory queries.

@see docs/plans/implement-session-memory-prompt.md
@see memory-bank/features/mbie-intelligence/README.md
"""

import sqlite3
import json
import uuid
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)


@dataclass
class SessionMemoryEntry:
    """A single memory entry from an agent session."""

    session_id: str
    repository: str
    branch: str
    agent_name: str
    memory_type: str  # insight | decision | context | error
    task: str
    content: str
    confidence_score: float = 1.0  # 0.0-1.0
    related_issues: List[int] = field(default_factory=list)
    retention_days: int = 30
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = field(default_factory=dict)
    id: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        d = asdict(self)
        d['created_at'] = self.created_at.isoformat()
        d['related_issues'] = json.dumps(self.related_issues)
        d['metadata'] = json.dumps(self.metadata)
        return d

    @classmethod
    def from_row(cls, row: tuple, columns: List[str]) -> 'SessionMemoryEntry':
        """Create from database row."""
        data = dict(zip(columns, row))
        data['created_at'] = datetime.fromisoformat(data['created_at'])
        data['related_issues'] = json.loads(data.get('related_issues', '[]'))
        data['metadata'] = json.loads(data.get('metadata', '{}'))
        return cls(**data)

    def decay_score(self, reference_time: Optional[datetime] = None) -> float:
        """Calculate relevance decay based on age. Newer = higher score.

        Uses UTC timestamps for consistency across timezones.
        """
        ref = reference_time or datetime.now(timezone.utc)

        # Ensure both timestamps have the same timezone awareness for comparison
        if ref.tzinfo is None and self.created_at.tzinfo is None:
            # Both naive - compare directly
            age_days = (ref - self.created_at).days
        elif ref.tzinfo is None:
            # ref is naive, created_at is aware - make ref aware
            ref_aware = ref.replace(tzinfo=timezone.utc)
            age_days = (ref_aware - self.created_at).days
        elif self.created_at.tzinfo is None:
            # created_at is naive, ref is aware - make created_at aware
            created_aware = self.created_at.replace(tzinfo=timezone.utc)
            age_days = (ref - created_aware).days
        else:
            # Both aware - compare directly
            age_days = (ref - self.created_at).days

        # Exponential decay: score halves every 7 days
        decay_factor = 0.5 ** (age_days / 7)
        return self.confidence_score * decay_factor


class SessionMemoryStore:
    """
    SQLite-backed storage for session memory.

    Uses WAL mode for concurrent read/write safety.
    """

    SCHEMA_VERSION = 1
    MAX_CONTENT_LENGTH = 50000  # 50KB max content to prevent disk exhaustion

    def __init__(self, db_path: Optional[str] = None):
        """Initialize session memory store.

        Args:
            db_path: Path to SQLite database. Defaults to ~/.claude/session_memory.db
        """
        if db_path is None:
            db_dir = Path.home() / ".claude"
            db_dir.mkdir(exist_ok=True)
            db_path = str(db_dir / "session_memory.db")

        self.db_path = db_path
        self._init_database()

    def _init_database(self):
        """Initialize database schema with migration support."""
        with self._get_connection() as conn:
            # Enable WAL mode for better concurrency
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA busy_timeout=5000")

            # Schema version tracking table must exist first
            conn.execute("""
                CREATE TABLE IF NOT EXISTS schema_info (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            """)

            # Check current schema version
            current_version = conn.execute(
                "SELECT value FROM schema_info WHERE key = 'version'"
            ).fetchone()
            current_version = int(current_version[0]) if current_version else 0

            # Run migrations if needed
            if current_version < self.SCHEMA_VERSION:
                self._run_migrations(conn, current_version)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS session_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    repository TEXT NOT NULL,
                    branch TEXT DEFAULT 'main',
                    agent_name TEXT NOT NULL,
                    memory_type TEXT NOT NULL,
                    task TEXT NOT NULL,
                    content TEXT NOT NULL,
                    confidence_score REAL DEFAULT 1.0,
                    related_issues TEXT DEFAULT '[]',
                    retention_days INTEGER DEFAULT 30,
                    created_at TEXT NOT NULL,
                    metadata TEXT DEFAULT '{}'
                )
            """)

            # Indexes for common queries
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_session_memory_repo
                ON session_memory(repository)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_session_memory_session
                ON session_memory(session_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_session_memory_type
                ON session_memory(memory_type)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_session_memory_created
                ON session_memory(created_at)
            """)

            # Update schema version
            conn.execute("""
                INSERT OR REPLACE INTO schema_info (key, value)
                VALUES ('version', ?)
            """, (str(self.SCHEMA_VERSION),))

            conn.commit()

    def _run_migrations(self, conn, from_version: int):
        """Run database migrations from current version to latest.

        Args:
            conn: Database connection
            from_version: Current schema version
        """
        logger.info(f"Running migrations from version {from_version} to {self.SCHEMA_VERSION}")

        # Future migrations would go here
        # Example:
        # if from_version < 2:
        #     conn.execute("ALTER TABLE session_memory ADD COLUMN new_field TEXT")
        #     logger.info("Applied migration to version 2")

        # For version 1 (initial schema), no migration needed
        if from_version == 0:
            logger.info("Initial schema creation, no migrations needed")

    @contextmanager
    def _get_connection(self):
        """Get database connection with automatic cleanup."""
        conn = sqlite3.connect(self.db_path)
        try:
            yield conn
        finally:
            conn.close()

    def save(self, entry: SessionMemoryEntry) -> int:
        """Save a memory entry.

        Args:
            entry: Memory entry to save

        Returns:
            ID of saved entry

        Raises:
            ValueError: If content exceeds maximum length
        """
        # Validate content size to prevent disk exhaustion
        if len(entry.content) > self.MAX_CONTENT_LENGTH:
            raise ValueError(
                f"Content length ({len(entry.content)}) exceeds maximum "
                f"allowed length ({self.MAX_CONTENT_LENGTH})"
            )

        with self._get_connection() as conn:
            cursor = conn.execute("""
                INSERT INTO session_memory
                (session_id, repository, branch, agent_name, memory_type,
                 task, content, confidence_score, related_issues,
                 retention_days, created_at, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry.session_id,
                entry.repository,
                entry.branch,
                entry.agent_name,
                entry.memory_type,
                entry.task,
                entry.content,
                entry.confidence_score,
                json.dumps(entry.related_issues),
                entry.retention_days,
                entry.created_at.isoformat(),
                json.dumps(entry.metadata)
            ))
            conn.commit()
            return cursor.lastrowid

    def get_by_id(self, entry_id: int) -> Optional[SessionMemoryEntry]:
        """Get entry by ID."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM session_memory WHERE id = ?",
                (entry_id,)
            )
            row = cursor.fetchone()
            if row:
                columns = [desc[0] for desc in cursor.description]
                return SessionMemoryEntry.from_row(row, columns)
        return None

    def query(
        self,
        repository: Optional[str] = None,
        agent_name: Optional[str] = None,
        memory_type: Optional[str] = None,
        since: Optional[datetime] = None,
        limit: int = 50,
        include_expired: bool = False
    ) -> List[SessionMemoryEntry]:
        """Query memory entries with filters.

        Args:
            repository: Filter by repository
            agent_name: Filter by agent
            memory_type: Filter by type (insight/decision/context/error)
            since: Only entries after this time
            limit: Max results
            include_expired: Include entries past retention

        Returns:
            List of matching entries, newest first
        """
        conditions = []
        params = []

        if repository:
            conditions.append("repository = ?")
            params.append(repository)

        if agent_name:
            conditions.append("agent_name = ?")
            params.append(agent_name)

        if memory_type:
            conditions.append("memory_type = ?")
            params.append(memory_type)

        if since:
            conditions.append("created_at >= ?")
            params.append(since.isoformat())

        if not include_expired:
            # Filter out expired entries
            conditions.append("""
                datetime(created_at, '+' || retention_days || ' days') > datetime('now')
            """)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        with self._get_connection() as conn:
            cursor = conn.execute(f"""
                SELECT * FROM session_memory
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ?
            """, params + [limit])

            columns = [desc[0] for desc in cursor.description]
            return [
                SessionMemoryEntry.from_row(row, columns)
                for row in cursor.fetchall()
            ]

    def search(
        self,
        query: str,
        repository: Optional[str] = None,
        limit: int = 20
    ) -> List[SessionMemoryEntry]:
        """Simple text search across content and task fields.

        For semantic search, use MBIE integration instead.

        Args:
            query: Text to search for
            repository: Filter by repository
            limit: Max results

        Returns:
            Matching entries sorted by relevance (recency-weighted)
        """
        conditions = ["(content LIKE ? OR task LIKE ?)"]
        params = [f"%{query}%", f"%{query}%"]

        if repository:
            conditions.append("repository = ?")
            params.append(repository)

        # Exclude expired
        conditions.append("""
            datetime(created_at, '+' || retention_days || ' days') > datetime('now')
        """)

        where_clause = " AND ".join(conditions)

        with self._get_connection() as conn:
            cursor = conn.execute(f"""
                SELECT * FROM session_memory
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ?
            """, params + [limit])

            columns = [desc[0] for desc in cursor.description]
            return [
                SessionMemoryEntry.from_row(row, columns)
                for row in cursor.fetchall()
            ]

    def delete_expired(self) -> int:
        """Delete entries past their retention period.

        Returns:
            Number of deleted entries
        """
        with self._get_connection() as conn:
            cursor = conn.execute("""
                DELETE FROM session_memory
                WHERE datetime(created_at, '+' || retention_days || ' days') <= datetime('now')
            """)
            conn.commit()
            deleted = cursor.rowcount
            if deleted > 0:
                logger.info(f"Deleted {deleted} expired session memory entries")
            return deleted

    def clear_before(self, before: datetime) -> int:
        """Delete all entries before a date.

        Args:
            before: Delete entries created before this time

        Returns:
            Number of deleted entries
        """
        with self._get_connection() as conn:
            cursor = conn.execute("""
                DELETE FROM session_memory
                WHERE created_at < ?
            """, (before.isoformat(),))
            conn.commit()
            return cursor.rowcount

    def get_sessions(self, repository: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get summary of all sessions.

        Args:
            repository: Filter by repository

        Returns:
            List of session summaries with counts
        """
        conditions = []
        params = []

        if repository:
            conditions.append("repository = ?")
            params.append(repository)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        with self._get_connection() as conn:
            cursor = conn.execute(f"""
                SELECT
                    session_id,
                    repository,
                    MIN(created_at) as started_at,
                    MAX(created_at) as ended_at,
                    COUNT(*) as entry_count,
                    GROUP_CONCAT(DISTINCT agent_name) as agents,
                    GROUP_CONCAT(DISTINCT memory_type) as types
                FROM session_memory
                WHERE {where_clause}
                GROUP BY session_id, repository
                ORDER BY ended_at DESC
            """, params)

            return [
                {
                    'session_id': row[0],
                    'repository': row[1],
                    'started_at': row[2],
                    'ended_at': row[3],
                    'entry_count': row[4],
                    'agents': row[5].split(',') if row[5] else [],
                    'types': row[6].split(',') if row[6] else []
                }
                for row in cursor.fetchall()
            ]

    def export_json(self, path: str, repository: Optional[str] = None):
        """Export all entries to JSON file.

        Args:
            path: Output file path
            repository: Filter by repository

        Raises:
            ValueError: If path is invalid or unsafe
        """
        # Validate and sanitize file path to prevent directory traversal
        file_path = Path(path).resolve()

        # Ensure path doesn't escape intended directory (basic safety check)
        if '..' in str(file_path):
            raise ValueError(f"Invalid file path containing '..' : {path}")

        # Ensure parent directory exists
        file_path.parent.mkdir(parents=True, exist_ok=True)

        entries = self.query(repository=repository, limit=10000, include_expired=True)
        data = {
            'exported_at': datetime.now(timezone.utc).isoformat(),
            'entry_count': len(entries),
            'entries': [e.to_dict() for e in entries]
        }

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"Exported {len(entries)} entries to {file_path}")

    def import_json(self, path: str) -> int:
        """Import entries from JSON file.

        Args:
            path: Input file path

        Returns:
            Number of imported entries

        Raises:
            ValueError: If path is invalid or file doesn't exist
        """
        # Validate and sanitize file path
        file_path = Path(path).resolve()

        # Ensure path doesn't escape intended directory (basic safety check)
        if '..' in str(file_path):
            raise ValueError(f"Invalid file path containing '..' : {path}")

        # Verify file exists
        if not file_path.exists():
            raise ValueError(f"Import file does not exist: {file_path}")

        with open(file_path, 'r') as f:
            data = json.load(f)

        count = 0
        for entry_data in data.get('entries', []):
            # Parse datetime
            entry_data['created_at'] = datetime.fromisoformat(entry_data['created_at'])
            # Parse JSON fields if they're strings
            if isinstance(entry_data.get('related_issues'), str):
                entry_data['related_issues'] = json.loads(entry_data['related_issues'])
            if isinstance(entry_data.get('metadata'), str):
                entry_data['metadata'] = json.loads(entry_data['metadata'])
            # Remove id to create new entry
            entry_data.pop('id', None)

            entry = SessionMemoryEntry(**entry_data)
            self.save(entry)
            count += 1

        logger.info(f"Imported {count} entries from {file_path}")
        return count

    def stats(self) -> Dict[str, Any]:
        """Get storage statistics.

        Returns:
            Dictionary with stats
        """
        with self._get_connection() as conn:
            total = conn.execute(
                "SELECT COUNT(*) FROM session_memory"
            ).fetchone()[0]

            by_type = dict(conn.execute("""
                SELECT memory_type, COUNT(*)
                FROM session_memory
                GROUP BY memory_type
            """).fetchall())

            by_repo = dict(conn.execute("""
                SELECT repository, COUNT(*)
                FROM session_memory
                GROUP BY repository
            """).fetchall())

            oldest = conn.execute(
                "SELECT MIN(created_at) FROM session_memory"
            ).fetchone()[0]

            newest = conn.execute(
                "SELECT MAX(created_at) FROM session_memory"
            ).fetchone()[0]

        return {
            'total_entries': total,
            'by_type': by_type,
            'by_repository': by_repo,
            'oldest_entry': oldest,
            'newest_entry': newest,
            'db_path': self.db_path
        }


# Convenience functions for common operations

def get_current_session_id() -> str:
    """Generate or get current session ID."""
    # Use environment variable if set, otherwise generate new
    return os.environ.get('CLAUDE_SESSION_ID', str(uuid.uuid4())[:8])


def get_current_repository() -> str:
    """Get current repository from git."""
    import subprocess
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--show-toplevel'],
            capture_output=True, text=True, check=True
        )
        return Path(result.stdout.strip()).name
    except subprocess.CalledProcessError as e:
        logger.debug(f"Git command failed: {e.stderr}")
        return 'unknown'
    except FileNotFoundError:
        logger.debug("Git executable not found in PATH")
        return 'unknown'


def get_current_branch() -> str:
    """Get current git branch."""
    import subprocess
    try:
        result = subprocess.run(
            ['git', 'branch', '--show-current'],
            capture_output=True, text=True, check=True
        )
        return result.stdout.strip() or 'main'
    except subprocess.CalledProcessError as e:
        logger.debug(f"Git branch command failed: {e.stderr}")
        return 'main'
    except FileNotFoundError:
        logger.debug("Git executable not found in PATH")
        return 'main'


def capture_memory(
    content: str,
    memory_type: str = 'insight',
    task: str = '',
    agent_name: str = 'claude',
    confidence: float = 1.0,
    issues: Optional[List[int]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    store: Optional[SessionMemoryStore] = None
) -> int:
    """Convenience function to capture a memory entry.

    Args:
        content: The memory content
        memory_type: insight | decision | context | error
        task: Description of current task
        agent_name: Name of agent capturing
        confidence: Confidence score 0.0-1.0
        issues: Related GitHub issue numbers
        metadata: Additional metadata
        store: SessionMemoryStore instance (creates default if None)

    Returns:
        ID of saved entry
    """
    if store is None:
        store = SessionMemoryStore()

    entry = SessionMemoryEntry(
        session_id=get_current_session_id(),
        repository=get_current_repository(),
        branch=get_current_branch(),
        agent_name=agent_name,
        memory_type=memory_type,
        task=task,
        content=content,
        confidence_score=confidence,
        related_issues=issues or [],
        metadata=metadata or {}
    )

    return store.save(entry)


# Module-level store instance for convenience
_default_store: Optional[SessionMemoryStore] = None

def get_store() -> SessionMemoryStore:
    """Get or create default store instance."""
    global _default_store
    if _default_store is None:
        _default_store = SessionMemoryStore()
    return _default_store


# Specialized capture hooks for common scenarios

def remember_decision(
    decision: str,
    rationale: str,
    task: str = '',
    issues: Optional[List[int]] = None
) -> int:
    """Capture a decision made during development.

    Usage: remember_decision("Use SQLite for storage", "Simple, no dependencies")
    """
    content = f"Decision: {decision}\nRationale: {rationale}"
    return capture_memory(
        content=content,
        memory_type='decision',
        task=task,
        confidence=0.9,
        issues=issues
    )


def remember_insight(
    insight: str,
    context: str = '',
    task: str = ''
) -> int:
    """Capture an insight or learning.

    Usage: remember_insight("MBIE uses ChromaDB for vector storage")
    """
    content = insight
    if context:
        content = f"{insight}\nContext: {context}"
    return capture_memory(
        content=content,
        memory_type='insight',
        task=task
    )


def remember_error(
    error: str,
    resolution: str,
    task: str = ''
) -> int:
    """Capture an error and its resolution.

    Usage: remember_error("Import failed", "Added path to sys.path")
    """
    content = f"Error: {error}\nResolution: {resolution}"
    return capture_memory(
        content=content,
        memory_type='error',
        task=task,
        confidence=1.0
    )


def remember_context(
    context: str,
    task: str = ''
) -> int:
    """Capture general context for future sessions.

    Usage: remember_context("Working on POC Phase A - session memory")
    """
    return capture_memory(
        content=context,
        memory_type='context',
        task=task
    )


def end_session_summary(
    summary: str,
    completed_tasks: Optional[List[str]] = None,
    next_steps: Optional[List[str]] = None
) -> int:
    """Capture session end summary for continuity.

    Usage: end_session_summary("Completed A.1-A.2", ["A.1", "A.2"], ["A.3 tests"])
    """
    content = f"Session Summary: {summary}"
    if completed_tasks:
        content += f"\nCompleted: {', '.join(completed_tasks)}"
    if next_steps:
        content += f"\nNext: {', '.join(next_steps)}"

    return capture_memory(
        content=content,
        memory_type='context',
        task='session_end',
        metadata={
            'completed_tasks': completed_tasks or [],
            'next_steps': next_steps or []
        }
    )


if __name__ == '__main__':
    # Quick test
    store = SessionMemoryStore()

    # Save test entry
    entry_id = capture_memory(
        content="Testing session memory storage",
        memory_type="insight",
        task="POC implementation",
        store=store
    )
    print(f"Saved entry with ID: {entry_id}")

    # Query
    entries = store.query(limit=5)
    print(f"Found {len(entries)} entries")

    # Stats
    stats = store.stats()
    print(f"Stats: {stats}")
