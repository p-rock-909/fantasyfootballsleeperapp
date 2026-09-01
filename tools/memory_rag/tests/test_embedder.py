"""Unit tests for Local Embedder"""

import pytest
import tempfile
from pathlib import Path
import sys
import numpy as np
sys.path.append(str(Path(__file__).parent.parent.parent))

from core.embedder import LocalEmbedder
from core.chunker import Chunk


@pytest.fixture
def embedder():
    """Create embedder with test configuration"""
    with tempfile.TemporaryDirectory() as tmpdir:
        config = {
            'model': {
                'name': 'sentence-transformers/all-MiniLM-L6-v2',
                'device': 'cpu',
                'batch_size': 2
            },
            'deterministic': {
                'enable': True,
                'random_seed': 42,
                'numpy_seed': 42,
                'torch_seed': 42
            },
            'storage': {
                'cache_path': tmpdir
            }
        }
        return LocalEmbedder(config)


def test_deterministic_embeddings(embedder):
    """Test reproducible embeddings with fixed seeds"""
    chunk = Chunk(
        chunk_id='test1',
        document_path='test.md',
        section_header='Test',
        content='Test content for embedding',
        navigation_path='test.md → Test',
        start_line=0,
        end_line=1,
        metadata={}
    )
    
    # Generate embeddings twice
    embedding1 = embedder.embed_chunks([chunk])[0]
    
    # Clear cache to force regeneration
    embedder.clear_cache()
    embedding2 = embedder.embed_chunks([chunk])[0]
    
    # Should be identical due to deterministic mode
    assert np.allclose(embedding1, embedding2, rtol=1e-5)


def test_embedding_dimensions(embedder):
    """Test embedding dimension consistency"""
    dimension = embedder.get_embedding_dimension()
    assert dimension == 384  # all-MiniLM-L6-v2 produces 384-dim embeddings
    
    chunk = Chunk(
        chunk_id='test2',
        document_path='test.md',
        section_header='Test',
        content='Test content',
        navigation_path='test.md → Test',
        start_line=0,
        end_line=1,
        metadata={}
    )
    
    embeddings = embedder.embed_chunks([chunk])
    assert len(embeddings[0]) == dimension


def test_embedding_cache(embedder):
    """Test caching mechanism"""
    chunks = [
        Chunk(
            chunk_id=f'test{i}',
            document_path='test.md',
            section_header=f'Section {i}',
            content=f'Content {i}',
            navigation_path=f'test.md → Section {i}',
            start_line=i,
            end_line=i+1,
            metadata={}
        )
        for i in range(3)
    ]
    
    # First call - generates embeddings
    embeddings1 = embedder.embed_chunks(chunks)
    assert len(embedder.embedding_cache) == 3
    
    # Second call - uses cache
    embeddings2 = embedder.embed_chunks(chunks)
    
    # Should be identical
    for e1, e2 in zip(embeddings1, embeddings2):
        assert np.allclose(e1, e2)


def test_batch_processing(embedder):
    """Test batch embedding generation"""
    # Create more chunks than batch size
    chunks = [
        Chunk(
            chunk_id=f'batch{i}',
            document_path='test.md',
            section_header=f'Section {i}',
            content=f'Content for batch processing {i}',
            navigation_path=f'test.md → Section {i}',
            start_line=i,
            end_line=i+1,
            metadata={}
        )
        for i in range(5)  # More than batch_size=2
    ]
    
    embeddings = embedder.embed_chunks(chunks)
    
    # Should process all chunks
    assert len(embeddings) == 5
    
    # All embeddings should be valid
    for emb in embeddings:
        assert len(emb) == embedder.get_embedding_dimension()
        assert all(isinstance(x, float) for x in emb)


def test_query_embedding(embedder):
    """Test single query embedding"""
    query = "test query for search"
    embedding = embedder.embed_query(query)
    
    # Check dimensions
    assert len(embedding) == embedder.get_embedding_dimension()
    
    # Should be reproducible
    embedding2 = embedder.embed_query(query)
    assert np.allclose(embedding, embedding2, rtol=1e-5)


def test_empty_chunks_handling(embedder):
    """Test handling of empty chunk list"""
    embeddings = embedder.embed_chunks([])
    assert embeddings == []


def test_cache_persistence():
    """Test cache save and load"""
    # Use persistent temp directory for this test
    with tempfile.TemporaryDirectory() as tmpdir:
        config = {
            'model': {
                'name': 'sentence-transformers/all-MiniLM-L6-v2',
                'device': 'cpu',
                'batch_size': 2
            },
            'deterministic': {
                'enable': True,
                'random_seed': 42,
                'numpy_seed': 42,
                'torch_seed': 42
            },
            'storage': {
                'cache_path': tmpdir
            }
        }

        chunk = Chunk(
            chunk_id='persist',
            document_path='test.md',
            section_header='Test',
            content='Persistent content',
            navigation_path='test.md → Test',
            start_line=0,
            end_line=1,
            metadata={}
        )

        # Create embedder and generate cache
        embedder = LocalEmbedder(config)
        embedding1 = embedder.embed_chunks([chunk])[0]
        embedder._save_cache()

        # Create new embedder with same cache path (still within tmpdir context)
        new_embedder = LocalEmbedder(config)

        # Should load from cache
        assert len(new_embedder.embedding_cache) > 0

        # Should return cached embedding
        embedding2 = new_embedder.embed_chunks([chunk])[0]
        assert np.allclose(embedding1, embedding2)


def test_mixed_cached_uncached(embedder):
    """Test processing mix of cached and uncached chunks"""
    cached_chunk = Chunk(
        chunk_id='cached',
        document_path='test.md',
        section_header='Cached',
        content='Already cached content',
        navigation_path='test.md → Cached',
        start_line=0,
        end_line=1,
        metadata={}
    )
    
    new_chunk = Chunk(
        chunk_id='new',
        document_path='test.md',
        section_header='New',
        content='Brand new content',
        navigation_path='test.md → New',
        start_line=2,
        end_line=3,
        metadata={}
    )
    
    # Cache first chunk
    embedder.embed_chunks([cached_chunk])
    initial_cache_size = len(embedder.embedding_cache)
    
    # Process both together
    embeddings = embedder.embed_chunks([cached_chunk, new_chunk])
    
    assert len(embeddings) == 2
    assert len(embedder.embedding_cache) == initial_cache_size + 1


def test_unicode_content_embedding(embedder):
    """Test embedding of unicode content"""
    chunk = Chunk(
        chunk_id='unicode',
        document_path='test.md',
        section_header='Unicode',
        content='Content with émojis 🔴🟡🟢 and 中文',
        navigation_path='test.md → Unicode',
        start_line=0,
        end_line=1,
        metadata={}
    )
    
    # Should not raise exceptions
    embeddings = embedder.embed_chunks([chunk])
    assert len(embeddings) == 1
    assert len(embeddings[0]) == embedder.get_embedding_dimension()


def test_long_content_embedding(embedder):
    """Test embedding of very long content"""
    long_content = ' '.join(['word'] * 1000)
    chunk = Chunk(
        chunk_id='long',
        document_path='test.md',
        section_header='Long',
        content=long_content,
        navigation_path='test.md → Long',
        start_line=0,
        end_line=100,
        metadata={}
    )
    
    embeddings = embedder.embed_chunks([chunk])
    assert len(embeddings) == 1
    assert len(embeddings[0]) == embedder.get_embedding_dimension()