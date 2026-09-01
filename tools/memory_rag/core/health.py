"""
MBIE Index Health Monitoring

Provides health check capabilities for MBIE index to detect stale, empty, or missing indices.

@see memory-bank/features/memory-rag/technical-design.md#health-monitoring
@navigation Use startHere.md → "Memory-Bank Intelligence Engine (MBIE)" path for context
"""

import logging
import time
from pathlib import Path
from typing import Dict, Tuple, Optional
import chromadb
from chromadb.config import Settings


logger = logging.getLogger(__name__)


class IndexHealthStatus:
    """Represents the health status of MBIE index"""

    HEALTHY = "healthy"
    STALE = "stale"
    EMPTY = "empty"
    MISSING = "missing"

    def __init__(self, status: str, chunk_count: int, index_age_hours: float,
                 message: str, actionable_command: Optional[str] = None):
        self.status = status
        self.chunk_count = chunk_count
        self.index_age_hours = index_age_hours
        self.message = message
        self.actionable_command = actionable_command

    def is_healthy(self) -> bool:
        """Check if index is healthy"""
        return self.status == self.HEALTHY

    def needs_rebuild(self) -> bool:
        """Check if index needs rebuilding"""
        return self.status in [self.EMPTY, self.MISSING]

    def needs_update(self) -> bool:
        """Check if index needs updating"""
        return self.status == self.STALE


class IndexHealthChecker:
    """
    Health checker for MBIE index.

    Checks:
    - Index existence
    - Index age (staleness)
    - Chunk count (emptiness)
    - Expected vs actual file coverage
    """

    # Default thresholds (can be overridden in config)
    DEFAULT_STALE_THRESHOLD_HOURS = 48  # Warn if >48 hours old
    DEFAULT_MIN_CHUNK_COUNT = 100  # Warn if <100 chunks (likely incomplete)

    def __init__(self, config: dict):
        """
        Initialize health checker.

        Args:
            config: MBIE configuration dict

        Raises:
            ValueError: If required configuration keys are missing
        """
        self.config = config

        # Validate required configuration
        storage_config = config.get('storage', {})
        memory_bank_root = storage_config.get('memory_bank_root')

        if not memory_bank_root:
            raise ValueError(
                "Configuration missing required key 'storage.memory_bank_root'. "
                "Please ensure your config.yml includes:\n"
                "storage:\n"
                "  memory_bank_root: '../../memory-bank'"
            )

        self.memory_bank_path = Path(memory_bank_root)
        self.index_path = self.memory_bank_path / '.rag' / 'index'
        self.db_path = self.index_path / 'chroma.sqlite3'

        # Load configurable thresholds with sensible defaults
        health_config = config.get('health', {})
        self.stale_threshold_hours = health_config.get(
            'stale_threshold_hours',
            self.DEFAULT_STALE_THRESHOLD_HOURS
        )
        self.min_chunk_count = health_config.get(
            'min_chunk_count',
            self.DEFAULT_MIN_CHUNK_COUNT
        )

    def check_health(self) -> IndexHealthStatus:
        """
        Perform comprehensive health check.

        Returns:
            IndexHealthStatus with diagnosis and recommendations
        """
        # Check if index exists
        if not self.index_path.exists():
            return IndexHealthStatus(
                status=IndexHealthStatus.MISSING,
                chunk_count=0,
                index_age_hours=0,
                message="Index directory does not exist",
                actionable_command="./mbie index --full"
            )

        if not self.db_path.exists():
            return IndexHealthStatus(
                status=IndexHealthStatus.MISSING,
                chunk_count=0,
                index_age_hours=0,
                message="ChromaDB database file missing",
                actionable_command="./mbie index --full"
            )

        # Get chunk count
        chunk_count = self._get_chunk_count()

        # Check if empty
        if chunk_count == 0:
            return IndexHealthStatus(
                status=IndexHealthStatus.EMPTY,
                chunk_count=0,
                index_age_hours=self._get_index_age_hours(),
                message="Index is empty (0 chunks)",
                actionable_command="./mbie index --full"
            )

        # Check index age
        index_age_hours = self._get_index_age_hours()

        if index_age_hours > self.stale_threshold_hours:
            return IndexHealthStatus(
                status=IndexHealthStatus.STALE,
                chunk_count=chunk_count,
                index_age_hours=index_age_hours,
                message=f"Index is stale ({index_age_hours:.1f}h old, threshold: {self.stale_threshold_hours}h)",
                actionable_command="./mbie index"
            )

        # Check if suspiciously small
        if chunk_count < self.min_chunk_count:
            return IndexHealthStatus(
                status=IndexHealthStatus.STALE,
                chunk_count=chunk_count,
                index_age_hours=index_age_hours,
                message=f"Index appears incomplete ({chunk_count} chunks, expected >{self.min_chunk_count})",
                actionable_command="./mbie index --full"
            )

        # All checks passed
        return IndexHealthStatus(
            status=IndexHealthStatus.HEALTHY,
            chunk_count=chunk_count,
            index_age_hours=index_age_hours,
            message=f"Index is healthy ({chunk_count} chunks, {index_age_hours:.1f}h old)",
            actionable_command=None
        )

    def _get_chunk_count(self) -> int:
        """Get number of chunks in index"""
        try:
            import sqlite3

            # Read chunk count directly from SQLite to avoid ChromaDB client conflicts
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT COUNT(*) FROM embeddings')
                count = cursor.fetchone()[0]
                return count

        except Exception as e:
            logger.warning(f"Failed to get chunk count: {e}")
            return 0

    def _get_index_age_hours(self) -> float:
        """Get index age in hours based on database modification time"""
        try:
            if not self.db_path.exists():
                return float('inf')

            mtime = self.db_path.stat().st_mtime
            age_seconds = time.time() - mtime
            return age_seconds / 3600

        except Exception as e:
            logger.warning(f"Failed to get index age: {e}")
            return float('inf')

    def get_quick_status(self) -> Tuple[bool, str]:
        """
        Get quick health status for inline warnings.

        Returns:
            Tuple of (is_healthy, warning_message)
        """
        health = self.check_health()

        if health.is_healthy():
            return (True, "")

        # Build warning message
        emoji = "!" if health.status == IndexHealthStatus.STALE else "X"
        warning = f"[{emoji}] {health.message}"

        if health.actionable_command:
            warning += f" -> Run '{health.actionable_command}'"

        return (False, warning)


def create_health_checker(config: dict) -> IndexHealthChecker:
    """Factory function to create health checker"""
    return IndexHealthChecker(config)
