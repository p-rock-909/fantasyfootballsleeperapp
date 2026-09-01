"""CLI interface tests"""

import pytest
import tempfile
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
sys.path.append(str(Path(__file__).parent.parent.parent))

import cli
from click.testing import CliRunner


@pytest.fixture
def runner():
    """Create CLI test runner"""
    return CliRunner()


@pytest.fixture
def temp_memory_bank():
    """Create temporary memory bank for testing"""
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_dir = Path(tmpdir)

        # Create test files
        (temp_dir / "business.md").write_text("""# Business Strategy
## Current Focus
Client acquisition and revenue optimization.
## Market Analysis
Competitive landscape assessment.
""")

        (temp_dir / "technical.md").write_text("""# Technical Documentation
## Architecture
System design patterns.
## Implementation
Code structure guidelines.
""")

        yield temp_dir


def create_test_config(temp_memory_bank, domains=None):
    """Helper to create a complete test config with all required fields"""
    return f"""
model:
  name: sentence-transformers/all-MiniLM-L6-v2
  device: cpu
  batch_size: 4
deterministic:
  random_seed: 42
  numpy_seed: 42
  torch_seed: 42
  enable: true
storage:
  memory_bank_root: {temp_memory_bank}
  index_path: {temp_memory_bank}/index
  cache_path: {temp_memory_bank}/cache
chunking:
  small_file_lines: 400
  medium_file_lines: 600
  chunk_size: 512
  chunk_overlap: 50
  section_regex: "^###?\\\\s+"
  use_token_based: true
  max_tokens_per_chunk: 512
search:
  top_k: 10
  relevance_threshold: 0.7
  hybrid_alpha: 0.7
domains: {domains or '{}'}
"""


def test_cli_help(runner):
    """Test CLI help command"""
    result = runner.invoke(cli.cli, ['--help'])
    
    assert result.exit_code == 0
    assert "Memory-Bank Intelligence Engine" in result.output
    assert "index" in result.output
    assert "query" in result.output
    assert "stats" in result.output


def test_index_command_help(runner):
    """Test index command help"""
    result = runner.invoke(cli.cli, ['index', '--help'])

    assert result.exit_code == 0
    assert "Index or update the memory-bank" in result.output
    assert "--full" in result.output


def test_search_command_help(runner):
    """Test query command help"""
    result = runner.invoke(cli.cli, ['query', '--help'])

    assert result.exit_code == 0
    assert "Query the memory-bank" in result.output
    assert "--domain" in result.output
    assert "--top-k" in result.output


@patch('cli.IncrementalIndexer')
@patch('cli.MemoryBankChunker')
@patch('cli.LocalEmbedder')
@patch('cli.HybridSearcher')
def test_index_command_success(mock_searcher, mock_embedder, mock_chunker, mock_indexer, runner, temp_memory_bank):
    """Test successful index command"""
    # Setup mocks
    mock_indexer_instance = MagicMock()
    mock_indexer_instance.incremental_index.return_value = 5
    mock_indexer.return_value = mock_indexer_instance

    mock_searcher_instance = MagicMock()
    mock_searcher_instance.get_statistics.return_value = {
        'total_chunks': 10,
        'unique_documents': 5,
        'category_distribution': {'🔴': 0, '🟡': 2, '🟢': 3}
    }
    mock_searcher.return_value = mock_searcher_instance

    # Create test config
    config_file = temp_memory_bank / "config.yml"
    config_file.write_text(create_test_config(temp_memory_bank))

    result = runner.invoke(cli.cli, ['--config', str(config_file), 'index'])

    assert result.exit_code == 0
    assert "Indexing complete!" in result.output
    assert "Documents Indexed" in result.output
    mock_searcher_instance.create_or_load_collection.assert_called_once()
    mock_indexer_instance.incremental_index.assert_called_once()


@patch('cli.HybridSearcher')
@patch('cli.LocalEmbedder')
def test_search_command_success(mock_embedder, mock_searcher, runner, temp_memory_bank):
    """Test successful search command"""
    from core.chunker import Chunk
    from core.searcher import SearchResult
    
    # Setup mocks
    mock_chunk = Chunk(
        chunk_id='test1',
        document_path='business.md',
        section_header='Business Strategy',
        content='Client acquisition and revenue optimization.',
        navigation_path='business.md → Business Strategy',
        start_line=0,
        end_line=2,
        metadata={'size_category': '🟢'}
    )
    
    mock_result = SearchResult(
        chunk=mock_chunk,
        score=0.80,
        relevance_type='hybrid'
    )
    
    mock_searcher_instance = MagicMock()
    mock_searcher_instance.search.return_value = [mock_result]
    mock_searcher.return_value = mock_searcher_instance
    
    # Create test config
    config_file = temp_memory_bank / "config.yml"
    config_file.write_text(create_test_config(temp_memory_bank))

    result = runner.invoke(cli.cli, ['--config', str(config_file), 'query', 'business strategy'])

    assert result.exit_code == 0
    assert "business.md" in result.output
    assert "Business Strategy" in result.output
    assert "Client acquisition" in result.output
    mock_searcher_instance.search.assert_called_once_with('business strategy', domain=None, intelligence_filters=None)


@patch('cli.HybridSearcher')
@patch('cli.LocalEmbedder')
def test_search_with_domain(mock_embedder, mock_searcher, runner, temp_memory_bank):
    """Test search command with domain filter"""
    mock_searcher_instance = MagicMock()
    mock_searcher_instance.search.return_value = []
    mock_searcher.return_value = mock_searcher_instance
    
    # Create test config with domains
    config_file = temp_memory_bank / "config.yml"
    domains_config = """
business:
  files: ['business*.md']
  boost: 1.2
  keywords: ['business', 'strategy']
"""
    config_file.write_text(create_test_config(temp_memory_bank, domains=domains_config))
    
    result = runner.invoke(cli.cli, ['--config', str(config_file), 'query', 'strategy', '--domain', 'business'])

    assert result.exit_code == 0
    mock_searcher_instance.search.assert_called_once_with('strategy', domain='business', intelligence_filters=None)


@patch('cli.HybridSearcher')
@patch('cli.LocalEmbedder')
def test_stats_command(mock_embedder, mock_searcher, runner, temp_memory_bank):
    """Test stats command"""
    mock_embedder_instance = MagicMock()
    mock_embedder_instance.get_embedding_dimension.return_value = 384
    mock_embedder.return_value = mock_embedder_instance

    mock_searcher_instance = MagicMock()
    mock_searcher_instance.get_statistics.return_value = {
        'total_chunks': 150,
        'unique_documents': 25,
        'embedding_dimension': 384,
        'category_distribution': {
            '🟢': 18,
            '🟡': 5,
            '🔴': 2
        }
    }
    mock_searcher.return_value = mock_searcher_instance

    # Create test config
    config_file = temp_memory_bank / "config.yml"
    config_file.write_text(create_test_config(temp_memory_bank))

    result = runner.invoke(cli.cli, ['--config', str(config_file), 'stats'])

    assert result.exit_code == 0
    assert "Total Chunks" in result.output
    assert "150" in result.output
    assert "Unique Documents" in result.output
    assert "25" in result.output
    assert "🟢" in result.output


def test_invalid_config_file(runner):
    """Test handling of invalid config file"""
    result = runner.invoke(cli.cli, ['index', '--config', 'nonexistent.yml'])
    
    assert result.exit_code != 0
    assert "Error" in result.output


def test_search_no_query(runner, temp_memory_bank):
    """Test query command without query"""
    config_file = temp_memory_bank / "config.yml"
    config_file.write_text("model: {name: test}")

    result = runner.invoke(cli.cli, ['query'])

    assert result.exit_code != 0


def test_verbose_output(runner, temp_memory_bank):
    """Test verbose output flag"""
    config_file = temp_memory_bank / "config.yml"
    config_file.write_text(create_test_config(temp_memory_bank))

    with patch('cli.IncrementalIndexer') as mock_indexer:
        with patch('cli.HybridSearcher') as mock_searcher:
            mock_indexer_instance = MagicMock()
            mock_indexer_instance.incremental_index.return_value = 3
            mock_indexer.return_value = mock_indexer_instance

            mock_searcher_instance = MagicMock()
            mock_searcher_instance.get_statistics.return_value = {
                'total_chunks': 6,
                'unique_documents': 3,
                'category_distribution': {'🔴': 0, '🟡': 1, '🟢': 2}
            }
            mock_searcher.return_value = mock_searcher_instance

            result = runner.invoke(cli.cli, ['--config', str(config_file), 'index', '--verbose'])

            assert result.exit_code == 0
            # Verbose output should include index information
            assert "Indexing" in result.output


def test_force_reindex(runner, temp_memory_bank):
    """Test force reindex flag"""
    config_file = temp_memory_bank / "config.yml"
    config_file.write_text(create_test_config(temp_memory_bank))

    with patch('cli.IncrementalIndexer') as mock_indexer:
        with patch('cli.HybridSearcher') as mock_searcher:
            mock_indexer_instance = MagicMock()
            mock_indexer_instance.full_index.return_value = 2
            mock_indexer.return_value = mock_indexer_instance

            mock_searcher_instance = MagicMock()
            mock_searcher_instance.get_statistics.return_value = {
                'total_chunks': 4,
                'unique_documents': 2,
                'category_distribution': {'🔴': 0, '🟡': 0, '🟢': 2}
            }
            mock_searcher.return_value = mock_searcher_instance

            result = runner.invoke(cli.cli, ['--config', str(config_file), 'index', '--full'])

            assert result.exit_code == 0
            # Full flag should trigger full reindex
            mock_indexer_instance.full_index.assert_called_once()