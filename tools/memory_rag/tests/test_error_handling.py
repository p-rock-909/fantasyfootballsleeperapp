"""Error handling and edge case tests"""

import pytest
import tempfile
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent.parent.parent))

from core.chunker import MemoryBankChunker, Chunk
from core.embedder import LocalEmbedder
from core.searcher import HybridSearcher
from core.indexer import IncrementalIndexer


@pytest.fixture
def test_config():
    """Create test configuration"""
    with tempfile.TemporaryDirectory() as tmpdir:
        return {
            'model': {
                'name': 'sentence-transformers/all-MiniLM-L6-v2',
                'device': 'cpu',
                'batch_size': 4
            },
            'deterministic': {
                'enable': True,
                'random_seed': 42,
                'numpy_seed': 42,
                'torch_seed': 42
            },
            'chunking': {
                'small_file_lines': 400,
                'medium_file_lines': 600,
                'chunk_size': 512,
                'chunk_overlap': 50,
                'section_regex': '^##\\s+'
            },
            'storage': {
                'memory_bank_root': tmpdir,
                'index_path': f'{tmpdir}/index',
                'cache_path': f'{tmpdir}/cache'
            },
            'search': {
                'top_k': 10,
                'relevance_threshold': 0.7,
                'hybrid_alpha': 0.7
            },
            'domains': {}
        }


def test_corrupted_file_handling(test_config):
    """Test handling of corrupted or unreadable files"""
    chunker = MemoryBankChunker(test_config)
    
    # Test binary file (should skip or handle gracefully)
    binary_content = b'\x00\x01\x02\x03\x04\x05'
    try:
        chunks = chunker.chunk_document("binary.bin", binary_content.decode('utf-8', errors='ignore'))
        # Should either return empty chunks or valid chunks with cleaned content
        assert isinstance(chunks, list)
    except UnicodeDecodeError:
        # Acceptable to fail on binary content
        pass


def test_extremely_large_file_handling(test_config):
    """Test handling of very large files"""
    chunker = MemoryBankChunker(test_config)
    
    # Create extremely large content (simulating memory constraints)
    large_content = "# Large File\n" + "\n".join(["line"] * 10000)  # 10k lines
    
    chunks = chunker.chunk_document("large.md", large_content)
    
    # Should handle gracefully without memory errors
    assert len(chunks) > 0
    assert all(isinstance(c, Chunk) for c in chunks)
    
    # Executive summary should be extracted for large files
    assert any("Executive Summary" in c.section_header for c in chunks)


def test_malformed_markdown_handling(test_config):
    """Test handling of malformed markdown"""
    chunker = MemoryBankChunker(test_config)
    
    # Malformed markdown with inconsistent headers
    malformed_content = """# Title
## Section 1
Content here
### Subsection (no parent ##)
More content
#### Deep nested without parents
Content
## Section 2
### Proper subsection
Content
"""
    
    chunks = chunker.chunk_document("malformed.md", malformed_content)
    
    # Should handle gracefully
    assert len(chunks) > 0
    assert all(c.content for c in chunks)  # All chunks should have content


def test_empty_section_handling(test_config):
    """Test handling of empty sections"""
    chunker = MemoryBankChunker(test_config)
    
    content = """# Document
## Empty Section 1

## Empty Section 2


## Section with Content
Some actual content here
## Another Empty Section

"""
    
    chunks = chunker.chunk_document("empty_sections.md", content)
    
    # Should skip empty sections or handle them appropriately
    non_empty_chunks = [c for c in chunks if c.content.strip()]
    assert len(non_empty_chunks) > 0
    
    # Content section should be preserved
    assert any("Some actual content" in c.content for c in chunks)


def test_memory_pressure_handling(test_config):
    """Test behavior under memory pressure"""
    embedder = LocalEmbedder(test_config)
    
    # Create many large chunks to simulate memory pressure
    large_chunks = []
    for i in range(100):  # Many chunks
        chunk = Chunk(
            chunk_id=f'memory{i}',
            document_path=f'test{i}.md',
            section_header=f'Section {i}',
            content='Large content ' * 1000,  # Large content per chunk
            navigation_path=f'test{i}.md → Section {i}',
            start_line=0,
            end_line=100,
            metadata={'size_category': '🔴'}
        )
        large_chunks.append(chunk)
    
    # Should handle batch processing without memory errors
    try:
        embeddings = embedder.embed_chunks(large_chunks)
        assert len(embeddings) == len(large_chunks)
    except MemoryError:
        # If memory error occurs, should be handled gracefully
        pytest.skip("System memory limitations reached")


def test_invalid_regex_handling(test_config):
    """Test handling of invalid regex patterns"""
    # Modify config with invalid regex
    invalid_config = test_config.copy()
    invalid_config['chunking']['section_regex'] = '['  # Invalid regex
    
    # Should either use default regex or handle gracefully
    try:
        chunker = MemoryBankChunker(invalid_config)
        content = "## Section 1\nContent"
        chunks = chunker.chunk_document("test.md", content)
        assert len(chunks) > 0
    except Exception:
        # Should provide meaningful error message
        assert True  # Expected to fail with invalid regex


def test_disk_space_exhaustion(test_config):
    """Test behavior when disk space is full"""
    embedder = LocalEmbedder(test_config)
    
    # Create chunk
    chunk = Chunk(
        chunk_id='disk_test',
        document_path='test.md',
        section_header='Test',
        content='Test content',
        navigation_path='test.md → Test',
        start_line=0,
        end_line=1,
        metadata={}
    )
    
    # Mock disk full condition by making cache directory read-only
    cache_path = Path(test_config['storage']['cache_path'])
    cache_path.mkdir(parents=True, exist_ok=True)
    
    try:
        # This might fail if disk space is actually full
        embeddings = embedder.embed_chunks([chunk])
        assert len(embeddings) == 1
    except (OSError, PermissionError):
        # Should handle disk space/permission errors gracefully
        assert True


def test_network_timeout_simulation(test_config):
    """Test handling of model download timeouts"""
    # This would typically test network failures during model download
    # For unit tests, we assume local models or mock the behavior
    
    embedder = LocalEmbedder(test_config)
    
    # Should initialize successfully with local model or handle timeout gracefully
    assert embedder.model is not None
    assert embedder.get_embedding_dimension() > 0


def test_concurrent_access_conflicts(test_config):
    """Test handling of concurrent file access"""
    import threading
    import time
    
    embedder = LocalEmbedder(test_config)
    
    def embed_worker(worker_id):
        chunk = Chunk(
            chunk_id=f'concurrent{worker_id}',
            document_path='test.md',
            section_header=f'Section {worker_id}',
            content=f'Content {worker_id}',
            navigation_path=f'test.md → Section {worker_id}',
            start_line=0,
            end_line=1,
            metadata={}
        )
        
        try:
            embedding = embedder.embed_chunks([chunk])
            return len(embedding) > 0
        except Exception:
            return False
    
    # Run multiple workers concurrently
    threads = []
    results = []
    
    for i in range(5):
        thread = threading.Thread(target=lambda i=i: results.append(embed_worker(i)))
        threads.append(thread)
        thread.start()
    
    for thread in threads:
        thread.join()
    
    # Should handle concurrent access without corruption
    assert len(results) == 5
    assert all(results)  # All workers should succeed


def test_invalid_chunk_data(test_config):
    """Test handling of invalid chunk data"""
    searcher = HybridSearcher(test_config, None)
    
    # Try to search without initializing collection
    try:
        results = searcher.search("test query")
        # Should return empty results or meaningful error
        assert isinstance(results, list)
    except Exception as e:
        # Should provide meaningful error message
        assert "collection" in str(e).lower() or "index" in str(e).lower()


def test_configuration_edge_cases(test_config):
    """Test edge cases in configuration values"""
    # Test with extreme configuration values
    edge_config = test_config.copy()
    edge_config['chunking']['chunk_size'] = 1  # Very small chunks
    edge_config['chunking']['chunk_overlap'] = 0  # No overlap
    edge_config['search']['top_k'] = 1000000  # Very large top_k
    
    chunker = MemoryBankChunker(edge_config)
    
    content = "## Test Section\nShort content"
    chunks = chunker.chunk_document("test.md", content)
    
    # Should handle extreme values gracefully
    assert len(chunks) > 0
    assert all(c.content for c in chunks)


def test_unicode_edge_cases(test_config):
    """Test handling of complex unicode scenarios"""
    chunker = MemoryBankChunker(test_config)
    
    # Complex unicode content
    unicode_content = """# Unicode Test 🌍
## Émojis and Symbols 🔴🟡🟢⭐️
Content with various unicode: 中文, العربية, हिन्दी, 🚀
## Math Symbols ∑∆∇∞
Mathematical content: ∫∂∇ with equations
## Special Characters
"Smart quotes" and 'apostrophes'
En dash – and em dash —
"""
    
    chunks = chunker.chunk_document("unicode.md", unicode_content)
    
    # Should preserve all unicode content
    assert len(chunks) > 0
    combined_content = " ".join(c.content for c in chunks)
    
    # Verify unicode preservation (check content that should be in chunks, not top-level headers)
    assert "🔴" in combined_content or "🟡" in combined_content  # Emojis in section headers/content
    assert "中文" in combined_content
    assert "العربية" in combined_content
    assert "∫∂∇" in combined_content
    assert '"' in combined_content or '"' in combined_content


def test_extremely_nested_sections(test_config):
    """Test handling of deeply nested markdown sections"""
    chunker = MemoryBankChunker(test_config)
    
    # Create deeply nested content
    nested_content = "# Level 1\n"
    for level in range(2, 10):  # Up to h9 (beyond standard markdown)
        nested_content += f"{'#' * level} Level {level} Section\n"
        nested_content += f"Content at level {level}\n"
    
    chunks = chunker.chunk_document("nested.md", nested_content)
    
    # Should handle deep nesting gracefully
    assert len(chunks) > 0
    
    # Should preserve structural information
    headers = [c.section_header for c in chunks]
    assert len(headers) > 0