#!/usr/bin/env python3
"""
Tests for session memory storage.

Run: pytest tests/test_session_memory.py -v
"""

import pytest
import tempfile
import os
import json
from datetime import datetime, timedelta
from pathlib import Path
import threading
import time

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from session_memory import (
    SessionMemoryStore,
    SessionMemoryEntry,
    capture_memory,
    remember_decision,
    remember_insight,
    remember_error,
    remember_context,
    end_session_summary,
    get_current_repository,
    get_current_branch,
)


@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    yield db_path
    # Cleanup
    if os.path.exists(db_path):
        os.unlink(db_path)
    # WAL files
    for ext in ['-wal', '-shm']:
        wal_path = db_path + ext
        if os.path.exists(wal_path):
            os.unlink(wal_path)


@pytest.fixture
def store(temp_db):
    """Create a store with temporary database."""
    return SessionMemoryStore(db_path=temp_db)


class TestSessionMemoryEntry:
    """Tests for SessionMemoryEntry dataclass."""

    def test_create_entry(self):
        """Test creating a memory entry."""
        entry = SessionMemoryEntry(
            session_id='test-123',
            repository='my-repo',
            branch='main',
            agent_name='claude',
            memory_type='insight',
            task='testing',
            content='This is a test insight'
        )

        assert entry.session_id == 'test-123'
        assert entry.repository == 'my-repo'
        assert entry.memory_type == 'insight'
        assert entry.confidence_score == 1.0
        assert entry.related_issues == []
        assert entry.retention_days == 30

    def test_to_dict(self):
        """Test converting entry to dictionary."""
        entry = SessionMemoryEntry(
            session_id='test-123',
            repository='my-repo',
            branch='main',
            agent_name='claude',
            memory_type='decision',
            task='testing',
            content='Use SQLite',
            related_issues=[1, 2, 3]
        )

        d = entry.to_dict()

        assert d['session_id'] == 'test-123'
        assert d['related_issues'] == '[1, 2, 3]'  # JSON encoded
        assert 'created_at' in d

    def test_decay_score(self):
        """Test memory decay over time."""
        now = datetime.now()

        # Fresh entry
        fresh = SessionMemoryEntry(
            session_id='test',
            repository='repo',
            branch='main',
            agent_name='claude',
            memory_type='insight',
            task='test',
            content='fresh',
            created_at=now
        )
        assert fresh.decay_score(now) == 1.0

        # Week old entry
        old = SessionMemoryEntry(
            session_id='test',
            repository='repo',
            branch='main',
            agent_name='claude',
            memory_type='insight',
            task='test',
            content='old',
            created_at=now - timedelta(days=7)
        )
        assert old.decay_score(now) == pytest.approx(0.5, rel=0.1)

        # Two weeks old
        older = SessionMemoryEntry(
            session_id='test',
            repository='repo',
            branch='main',
            agent_name='claude',
            memory_type='insight',
            task='test',
            content='older',
            created_at=now - timedelta(days=14)
        )
        assert older.decay_score(now) == pytest.approx(0.25, rel=0.1)


class TestSessionMemoryStore:
    """Tests for SessionMemoryStore."""

    def test_create_store(self, temp_db):
        """Test creating a store."""
        store = SessionMemoryStore(db_path=temp_db)
        assert store.db_path == temp_db
        assert os.path.exists(temp_db)

    def test_save_and_retrieve(self, store):
        """Test saving and retrieving entries."""
        entry = SessionMemoryEntry(
            session_id='test-123',
            repository='my-repo',
            branch='main',
            agent_name='claude',
            memory_type='insight',
            task='testing',
            content='Test content'
        )

        entry_id = store.save(entry)
        assert entry_id is not None

        retrieved = store.get_by_id(entry_id)
        assert retrieved is not None
        assert retrieved.session_id == 'test-123'
        assert retrieved.content == 'Test content'

    def test_query_by_repository(self, store):
        """Test querying by repository."""
        # Save entries for different repos
        for repo in ['repo-a', 'repo-b', 'repo-a']:
            entry = SessionMemoryEntry(
                session_id='test',
                repository=repo,
                branch='main',
                agent_name='claude',
                memory_type='insight',
                task='test',
                content=f'Content for {repo}'
            )
            store.save(entry)

        results = store.query(repository='repo-a')
        assert len(results) == 2

        results = store.query(repository='repo-b')
        assert len(results) == 1

    def test_query_by_type(self, store):
        """Test querying by memory type."""
        for mem_type in ['insight', 'decision', 'insight', 'error']:
            entry = SessionMemoryEntry(
                session_id='test',
                repository='repo',
                branch='main',
                agent_name='claude',
                memory_type=mem_type,
                task='test',
                content=f'Content type {mem_type}'
            )
            store.save(entry)

        results = store.query(memory_type='insight')
        assert len(results) == 2

        results = store.query(memory_type='decision')
        assert len(results) == 1

    def test_search(self, store):
        """Test text search."""
        entries = [
            ('Authentication flow implementation', 'auth'),
            ('Database schema design', 'database'),
            ('Auth token validation', 'auth'),
        ]

        for content, task in entries:
            entry = SessionMemoryEntry(
                session_id='test',
                repository='repo',
                branch='main',
                agent_name='claude',
                memory_type='insight',
                task=task,
                content=content
            )
            store.save(entry)

        # Search content
        results = store.search('Auth')
        assert len(results) == 2

        # Search task
        results = store.search('database')
        assert len(results) == 1

    def test_delete_expired(self, store):
        """Test deleting expired entries."""
        now = datetime.now()

        # Non-expired entry
        fresh = SessionMemoryEntry(
            session_id='test',
            repository='repo',
            branch='main',
            agent_name='claude',
            memory_type='insight',
            task='test',
            content='fresh',
            retention_days=30,
            created_at=now
        )
        store.save(fresh)

        # Manually insert an expired entry
        expired_date = (now - timedelta(days=40)).isoformat()
        with store._get_connection() as conn:
            conn.execute("""
                INSERT INTO session_memory
                (session_id, repository, branch, agent_name, memory_type,
                 task, content, retention_days, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, ('test', 'repo', 'main', 'claude', 'insight',
                  'test', 'expired', 30, expired_date))
            conn.commit()

        # Should have 2 entries
        assert len(store.query(include_expired=True)) == 2

        # Delete expired
        deleted = store.delete_expired()
        assert deleted == 1

        # Should have 1 entry
        assert len(store.query(include_expired=True)) == 1

    def test_get_sessions(self, store):
        """Test getting session summaries."""
        # Create entries for multiple sessions
        sessions = [
            ('session-1', 'repo-a', 'claude'),
            ('session-1', 'repo-a', 'builder'),
            ('session-2', 'repo-a', 'claude'),
            ('session-3', 'repo-b', 'qa'),
        ]

        for session_id, repo, agent in sessions:
            entry = SessionMemoryEntry(
                session_id=session_id,
                repository=repo,
                branch='main',
                agent_name=agent,
                memory_type='insight',
                task='test',
                content='test'
            )
            store.save(entry)

        summaries = store.get_sessions()
        assert len(summaries) == 3

        # Check session-1 summary
        s1 = next(s for s in summaries if s['session_id'] == 'session-1')
        assert s1['entry_count'] == 2
        assert set(s1['agents']) == {'claude', 'builder'}

    def test_export_import_json(self, store, temp_db):
        """Test JSON export/import."""
        # Create some entries
        for i in range(5):
            entry = SessionMemoryEntry(
                session_id=f'test-{i}',
                repository='repo',
                branch='main',
                agent_name='claude',
                memory_type='insight',
                task=f'task-{i}',
                content=f'content-{i}'
            )
            store.save(entry)

        # Export
        export_path = temp_db + '.json'
        store.export_json(export_path)

        assert os.path.exists(export_path)

        # Check exported content
        with open(export_path, 'r') as f:
            data = json.load(f)
        assert data['entry_count'] == 5

        # Create new store and import
        new_db = temp_db + '.new.db'
        new_store = SessionMemoryStore(db_path=new_db)
        imported = new_store.import_json(export_path)

        assert imported == 5
        assert len(new_store.query()) == 5

        # Cleanup
        os.unlink(export_path)
        os.unlink(new_db)

    def test_stats(self, store):
        """Test statistics."""
        types = ['insight', 'decision', 'insight', 'error']
        for mem_type in types:
            entry = SessionMemoryEntry(
                session_id='test',
                repository='repo',
                branch='main',
                agent_name='claude',
                memory_type=mem_type,
                task='test',
                content='test'
            )
            store.save(entry)

        stats = store.stats()

        assert stats['total_entries'] == 4
        assert stats['by_type']['insight'] == 2
        assert stats['by_type']['decision'] == 1
        assert stats['by_type']['error'] == 1


class TestConcurrency:
    """Test concurrent access to store."""

    def test_concurrent_writes(self, temp_db):
        """Test multiple writers don't corrupt data."""
        store = SessionMemoryStore(db_path=temp_db)
        num_threads = 5
        entries_per_thread = 20
        errors = []

        def write_entries(thread_id):
            try:
                for i in range(entries_per_thread):
                    entry = SessionMemoryEntry(
                        session_id=f'thread-{thread_id}',
                        repository='repo',
                        branch='main',
                        agent_name='claude',
                        memory_type='insight',
                        task=f'task-{i}',
                        content=f'content from thread {thread_id}'
                    )
                    store.save(entry)
            except Exception as e:
                errors.append(e)

        threads = [
            threading.Thread(target=write_entries, args=(i,))
            for i in range(num_threads)
        ]

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # No errors should occur
        assert len(errors) == 0

        # All entries should be saved
        all_entries = store.query(limit=1000)
        assert len(all_entries) == num_threads * entries_per_thread


class TestCaptureHooks:
    """Test convenience capture functions."""

    def test_remember_decision(self, temp_db):
        """Test decision capture."""
        os.environ['CLAUDE_SESSION_ID'] = 'test-session'
        store = SessionMemoryStore(db_path=temp_db)

        entry_id = remember_decision(
            decision='Use PostgreSQL',
            rationale='Better for production',
            task='database selection'
        )

        # Verify in store (using default store location, not temp)
        # Just verify no exception was raised
        assert entry_id is not None

    def test_remember_insight(self):
        """Test insight capture."""
        entry_id = remember_insight(
            insight='MBIE uses hybrid search',
            context='Discovered while reading code'
        )
        assert entry_id is not None

    def test_remember_error(self):
        """Test error capture."""
        entry_id = remember_error(
            error='Connection timeout',
            resolution='Increased timeout to 30s'
        )
        assert entry_id is not None

    def test_end_session_summary(self):
        """Test session summary capture."""
        entry_id = end_session_summary(
            summary='Completed Phase A tasks',
            completed_tasks=['A.1', 'A.2', 'A.3'],
            next_steps=['A.4 MBIE integration']
        )
        assert entry_id is not None


class TestUtilityFunctions:
    """Test utility functions."""

    def test_get_current_repository(self):
        """Test repository detection."""
        repo = get_current_repository()
        # Should return 'Template' when run from this repo
        assert repo == 'Template' or repo == 'unknown'

    def test_get_current_branch(self):
        """Test branch detection."""
        branch = get_current_branch()
        # Should return a branch name
        assert isinstance(branch, str)
        assert len(branch) > 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
