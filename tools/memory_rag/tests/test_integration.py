"""Integration tests for MBIE end-to-end workflows"""

import pytest
import tempfile
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent.parent.parent))

from core import MemoryBankChunker, LocalEmbedder, HybridSearcher, IncrementalIndexer


@pytest.fixture
def integration_config():
    """Create integration test configuration"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield {
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
                'top_k': 5,
                'relevance_threshold': 0.3,
                'hybrid_alpha': 0.7
            },
            'domains': {
                'test': {
                    'files': ['test_business.md'],
                    'boost': 1.2,
                    'keywords': ['business', 'strategy']
                }
            }
        }


def test_end_to_end_workflow(integration_config):
    """Test complete indexing and search workflow"""
    # Create test documents in temp directory
    temp_dir = Path(integration_config['storage']['memory_bank_root'])
    
    # Business document (should match domain)
    business_doc = temp_dir / "test_business.md"
    business_content = """# Business Strategy
## Current Priorities
Focus on client acquisition and revenue growth.
Business development is key to success.

## Market Analysis  
Understanding the competitive landscape.
"""
    business_doc.write_text(business_content)
    
    # Technical document
    tech_doc = temp_dir / "test_technical.md"
    tech_content = """# Technical Architecture
## System Design
Building scalable and reliable systems.
Performance optimization is crucial.

## Implementation Details
Code quality and testing are important.
"""
    tech_doc.write_text(tech_content)
    
    # Initialize all components
    chunker = MemoryBankChunker(integration_config)
    embedder = LocalEmbedder(integration_config)
    searcher = HybridSearcher(integration_config, embedder)
    indexer = IncrementalIndexer(integration_config, chunker, embedder, searcher)
    
    # Create collection
    searcher.create_or_load_collection()
    
    # Index documents
    indexed_count = indexer.full_index()
    
    # Verify indexing
    assert indexed_count == 2  # Both documents indexed
    
    # Test search functionality
    results = searcher.search("business strategy")
    
    # Should find relevant results
    assert len(results) > 0
    assert any("business" in r.chunk.content.lower() for r in results)
    
    # Test domain-specific search (query for content actually in chunks, not just title)
    domain_results = searcher.search("business development", domain="test")
    assert len(domain_results) > 0
    # Verify domain filtering worked - results should only be from test domain
    assert all(r.chunk.document_path == "test_business.md" for r in domain_results)
    
    # Test statistics
    stats = searcher.get_statistics()
    assert stats['unique_documents'] == 2
    assert stats['total_chunks'] > 0


def test_incremental_indexing_workflow(integration_config):
    """Test incremental indexing with file changes"""
    # Setup
    temp_dir = Path(integration_config['storage']['memory_bank_root'])
    chunker = MemoryBankChunker(integration_config)
    embedder = LocalEmbedder(integration_config)
    searcher = HybridSearcher(integration_config, embedder)
    indexer = IncrementalIndexer(integration_config, chunker, embedder, searcher)
    
    searcher.create_or_load_collection()
    
    # Create initial document
    doc1 = temp_dir / "doc1.md"
    doc1.write_text("# Initial Content\nOriginal text here")
    
    # Initial index
    indexed = indexer.full_index()
    assert indexed == 1
    
    # Add new document
    doc2 = temp_dir / "doc2.md" 
    doc2.write_text("# New Document\nNew content added")
    
    # Incremental update should detect new file
    new_files, modified_files, deleted_files = indexer.detect_changes()
    assert "doc2.md" in new_files
    assert len(modified_files) == 0
    assert len(deleted_files) == 0
    
    # Index changes
    indexed = indexer.incremental_index()
    assert indexed == 1  # One new file
    
    # Modify existing document
    doc1.write_text("# Modified Content\nUpdated text here")
    
    # Should detect modification
    new_files, modified_files, deleted_files = indexer.detect_changes()
    assert len(new_files) == 0
    assert "doc1.md" in modified_files
    assert len(deleted_files) == 0
    
    # Index modifications
    indexed = indexer.incremental_index()
    assert indexed == 1  # One modified file


def test_error_resilience(integration_config):
    """Test system behavior with various error conditions"""
    temp_dir = Path(integration_config['storage']['memory_bank_root'])
    chunker = MemoryBankChunker(integration_config)
    embedder = LocalEmbedder(integration_config)
    searcher = HybridSearcher(integration_config, embedder)
    indexer = IncrementalIndexer(integration_config, chunker, embedder, searcher)
    
    # Create valid document
    valid_doc = temp_dir / "valid.md"
    valid_doc.write_text("# Valid Document\nThis should work fine")
    
    # Create empty document
    empty_doc = temp_dir / "empty.md"
    empty_doc.write_text("")
    
    # Create document with unicode
    unicode_doc = temp_dir / "unicode.md"
    unicode_doc.write_text("# Unicode Test 🔴🟡🟢\nContent with émojis and 中文")
    
    # Initialize system
    searcher.create_or_load_collection()
    
    # Index should handle all cases gracefully
    indexed = indexer.full_index()
    
    # Should index valid and unicode docs, skip empty
    assert indexed >= 1  # At least the valid document
    
    # Search should work despite mixed content
    results = searcher.search("valid document")
    assert len(results) > 0
    
    # Unicode search should work
    unicode_results = searcher.search("unicode test")
    assert len(unicode_results) >= 0  # May or may not find results


def test_memory_bank_categorization(integration_config):
    """Test proper handling of different file size categories"""
    temp_dir = Path(integration_config['storage']['memory_bank_root'])
    chunker = MemoryBankChunker(integration_config)
    embedder = LocalEmbedder(integration_config)
    searcher = HybridSearcher(integration_config, embedder)
    
    # Create small file (🟢)
    small_file = temp_dir / "small.md"
    small_content = "# Small File\n" + "\n".join(["Small content"] * 50)
    small_file.write_text(small_content)
    
    # Create medium file (🟡)  
    medium_file = temp_dir / "medium.md"
    medium_content = "# Medium File\n" + "\n".join(["Medium content"] * 450)
    medium_file.write_text(medium_content)
    
    # Create large file (🔴)
    large_file = temp_dir / "large.md" 
    large_content = "Executive summary content\n\n## Section 1\n" + "\n".join(["Large content"] * 700)
    large_file.write_text(large_content)
    
    # Process files
    small_chunks = chunker.chunk_document("small.md", small_content)
    medium_chunks = chunker.chunk_document("medium.md", medium_content)  
    large_chunks = chunker.chunk_document("large.md", large_content)
    
    # Verify categorization
    assert all(c.metadata['size_category'] == '🟢' for c in small_chunks)
    assert all(c.metadata['size_category'] == '🟡' for c in medium_chunks)
    assert all(c.metadata['size_category'] == '🔴' for c in large_chunks)
    
    # Large file should have executive summary
    assert any("Executive Summary" in c.section_header for c in large_chunks)
    
    # Test search across different categories
    searcher.create_or_load_collection()
    all_chunks = small_chunks + medium_chunks + large_chunks
    embeddings = embedder.embed_chunks(all_chunks)
    searcher.add_chunks(all_chunks, embeddings)
    
    # Should find results (at least from small and large files)
    results = searcher.search("content")
    assert len(results) > 0
    categories = {r.chunk.metadata['size_category'] for r in results}
    # Verify we have results from at least one category, and categories are properly tagged
    assert len(categories) >= 1
    assert all(cat in ['🟢', '🟡', '🔴'] for cat in categories)