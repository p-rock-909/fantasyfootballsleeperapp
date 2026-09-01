"""
Tests for CLI analytics integration (Issue #216).

Tests the end-to-end integration between CLI query command and analytics system
to ensure learning loop functionality works correctly.

@see memory-bank/features/mbie-intelligence/adaptive-learning-design.md
@see https://github.com/NoCapLife/Personal/issues/216
"""

import pytest
import tempfile
import sqlite3
from unittest.mock import Mock, patch, MagicMock
from pathlib import Path
import time

from click.testing import CliRunner
from cli import cli


class TestCLIAnalyticsIntegration:
    """Test CLI integration with analytics system"""
    
    @pytest.fixture
    def temp_analytics_db(self):
        """Create temporary analytics database for testing"""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as temp_file:
            db_path = temp_file.name
            
        # Initialize database
        from core.analytics import AnalyticsDatabase
        analytics_db = AnalyticsDatabase(db_path)
        
        yield db_path
        
        # Cleanup
        Path(db_path).unlink(missing_ok=True)
    
    @pytest.fixture
    def test_config_with_analytics(self, temp_analytics_db):
        """Test configuration with analytics enabled"""
        return {
            'analytics': {
                'enabled': True,
                'database_path': temp_analytics_db,
                'query_tracking': {
                    'enabled': True,
                    'session_timeout': 1800,
                    'interaction_tracking': True
                }
            },
            'intelligence': {
                'temporal_context': {
                    'current_quarter': 'Q3 2025',
                    'current_phase': 'Test Phase'
                }
            },
            'search': {
                'top_k': 5
            },
            'model': {
                'name': 'test-model'
            },
            'storage': {
                'memory_bank_root': './test-memory-bank'
            },
            'logging': {
                'level': 'INFO',
                'format': '%(message)s',
                'file': 'test.log'
            }
        }
    
    def test_analytics_integration_enabled(self, test_config_with_analytics, temp_analytics_db):
        """Test that analytics are recorded when enabled"""
        runner = CliRunner()
        
        # Mock the search components to avoid needing actual embeddings
        with patch('cli.LocalEmbedder') as mock_embedder, \
             patch('cli.HybridSearcher') as mock_searcher, \
             patch('cli.load_config') as mock_load_config:
            
            # Setup mocks
            mock_load_config.return_value = test_config_with_analytics
            
            mock_searcher_instance = Mock()
            mock_searcher.return_value = mock_searcher_instance
            
            # Mock search results
            mock_result = Mock()
            mock_result.chunk.chunk_id = "test_chunk_1"
            mock_result.citation = "test citation"
            mock_result.score = 0.95
            mock_result.chunk.navigation_path = "test/path"
            mock_result.chunk.content = "Test content"
            mock_result.relevance_type = "test"
            mock_result.chunk.metadata = {"size_category": "🟢"}
            
            mock_searcher_instance.search.return_value = [mock_result]
            mock_searcher_instance.create_or_load_collection.return_value = None
            
            # Run the query command
            result = runner.invoke(cli, ['query', 'test query', '-k', '1'])
            
            # Should complete successfully
            assert result.exit_code == 0
            assert "test citation" in result.output
            
            # Check that analytics were recorded
            with sqlite3.connect(temp_analytics_db) as conn:
                cursor = conn.cursor()
                
                # Check query analytics
                cursor.execute("SELECT COUNT(*) FROM query_analytics")
                query_count = cursor.fetchone()[0]
                assert query_count == 1
                
                # Check session data
                cursor.execute("SELECT COUNT(*) FROM usage_sessions")
                session_count = cursor.fetchone()[0]
                assert session_count == 1
                
                # Check interaction data
                cursor.execute("SELECT COUNT(*) FROM user_interactions")
                interaction_count = cursor.fetchone()[0]
                assert interaction_count == 1
                
                # Verify query data
                cursor.execute("SELECT query_text, business_context, result_count FROM query_analytics")
                row = cursor.fetchone()
                assert row[0] == "test query"
                assert "Q3 2025" in row[1]
                assert row[2] == 1
    
    def test_analytics_integration_disabled(self, temp_analytics_db):
        """Test that analytics are not recorded when disabled"""
        runner = CliRunner()
        
        config_disabled = {
            'analytics': {
                'enabled': False,
                'database_path': temp_analytics_db
            },
            'search': {'top_k': 5},
            'model': {'name': 'test-model'},
            'storage': {'memory_bank_root': './test-memory-bank'},
            'logging': {'level': 'INFO', 'format': '%(message)s', 'file': 'test.log'}
        }
        
        with patch('cli.LocalEmbedder') as mock_embedder, \
             patch('cli.HybridSearcher') as mock_searcher, \
             patch('cli.load_config') as mock_load_config:
            
            mock_load_config.return_value = config_disabled
            
            mock_searcher_instance = Mock()
            mock_searcher.return_value = mock_searcher_instance
            mock_searcher_instance.search.return_value = []
            mock_searcher_instance.create_or_load_collection.return_value = None
            
            # Run the query command
            result = runner.invoke(cli, ['query', 'test query disabled', '-k', '1'])
            
            # Should complete successfully
            assert result.exit_code == 0
            
            # Check that NO analytics were recorded
            with sqlite3.connect(temp_analytics_db) as conn:
                cursor = conn.cursor()
                
                cursor.execute("SELECT COUNT(*) FROM query_analytics")
                query_count = cursor.fetchone()[0]
                assert query_count == 0
    
    def test_analytics_graceful_failure(self, test_config_with_analytics):
        """Test that CLI works even if analytics system fails"""
        runner = CliRunner()
        
        # Use invalid database path to force analytics failure
        config_invalid = test_config_with_analytics.copy()
        config_invalid['analytics']['database_path'] = '/invalid/path/analytics.db'
        
        with patch('cli.LocalEmbedder') as mock_embedder, \
             patch('cli.HybridSearcher') as mock_searcher, \
             patch('cli.load_config') as mock_load_config:
            
            mock_load_config.return_value = config_invalid
            
            mock_searcher_instance = Mock()
            mock_searcher.return_value = mock_searcher_instance
            mock_searcher_instance.search.return_value = []
            mock_searcher_instance.create_or_load_collection.return_value = None
            
            # Run the query command - should not crash
            result = runner.invoke(cli, ['query', 'test query failure', '-k', '1'])
            
            # Should complete successfully despite analytics failure
            assert result.exit_code == 0
            assert "No results found" in result.output
    
    def test_business_context_extraction(self, test_config_with_analytics, temp_analytics_db):
        """Test that business context is correctly extracted from config"""
        runner = CliRunner()
        
        with patch('cli.LocalEmbedder') as mock_embedder, \
             patch('cli.HybridSearcher') as mock_searcher, \
             patch('cli.load_config') as mock_load_config:
            
            mock_load_config.return_value = test_config_with_analytics
            
            mock_searcher_instance = Mock()
            mock_searcher.return_value = mock_searcher_instance
            mock_searcher_instance.search.return_value = []
            mock_searcher_instance.create_or_load_collection.return_value = None
            
            # Run the query command
            result = runner.invoke(cli, ['query', 'business context test', '-k', '1'])
            
            # Check recorded business context
            with sqlite3.connect(temp_analytics_db) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT business_context FROM query_analytics")
                row = cursor.fetchone()
                assert row is not None
                business_context = row[0]
                assert "Q3 2025" in business_context
                assert "Test Phase" in business_context
    
    def test_response_time_tracking(self, test_config_with_analytics, temp_analytics_db):
        """Test that response time is tracked"""
        runner = CliRunner()
        
        with patch('cli.LocalEmbedder') as mock_embedder, \
             patch('cli.HybridSearcher') as mock_searcher, \
             patch('cli.load_config') as mock_load_config:
            
            mock_load_config.return_value = test_config_with_analytics
            
            mock_searcher_instance = Mock()
            mock_searcher.return_value = mock_searcher_instance
            mock_searcher_instance.search.return_value = []
            mock_searcher_instance.create_or_load_collection.return_value = None
            
            # Add small delay to ensure measurable response time
            def slow_search(*args, **kwargs):
                time.sleep(0.01)  # 10ms delay
                return []
            
            mock_searcher_instance.search.side_effect = slow_search
            
            # Run the query command
            result = runner.invoke(cli, ['query', 'response time test', '-k', '1'])
            
            # Check recorded response time
            with sqlite3.connect(temp_analytics_db) as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT response_time_ms FROM query_analytics")
                row = cursor.fetchone()
                assert row is not None
                response_time = row[0]
                assert response_time > 0  # Should have measurable response time
                assert response_time < 30000  # Should be reasonable (< 30 seconds)


class TestPhase2Availability:
    """Test Phase 2 availability detection"""
    
    def test_phase2_available_with_all_imports(self):
        """Test that PHASE2_AVAILABLE is True when all imports succeed"""
        # This test verifies the fix for the integration import issue
        from cli import PHASE2_AVAILABLE
        assert PHASE2_AVAILABLE is True, "PHASE2_AVAILABLE should be True after fixing integration imports"
    
    @patch('cli.create_analytics_system')
    def test_analytics_system_import(self, mock_create_analytics):
        """Test that create_analytics_system can be imported and called"""
        from cli import create_analytics_system
        
        # Should be able to call the function
        mock_create_analytics.return_value = (Mock(), Mock())
        collector, analyzer = create_analytics_system({})
        
        assert collector is not None
        assert analyzer is not None
        mock_create_analytics.assert_called_once()


class TestIntegrationBugFixes:
    """Test the specific bugs that were fixed in Issue #216"""
    
    def test_config_storage_fallback(self):
        """Test that analytics system handles missing storage config gracefully"""
        from core.analytics import create_analytics_system
        import tempfile
        
        # Create temporary database
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as temp_file:
            temp_db_path = temp_file.name
        
        try:
            # Test config without storage section
            config_without_storage = {
                'analytics': {
                    'enabled': True,
                    'database_path': temp_db_path
                }
            }
            
            # Should not raise KeyError
            collector, analyzer = create_analytics_system(config_without_storage)
            assert collector is not None
            assert analyzer is not None
        finally:
            # Cleanup
            Path(temp_db_path).unlink(missing_ok=True)
    
    def test_integrations_import_graceful_failure(self):
        """Test that integrations module handles missing files gracefully"""
        # This test verifies the fix for integrations/__init__.py
        try:
            from integrations.calendar_integration import create_calendar_integration
            import_successful = True
        except ImportError:
            import_successful = False
        
        # Should not fail even if some integration files are missing
        assert import_successful, "Integration imports should handle missing files gracefully"