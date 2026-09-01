"""Performance tests for MBIE"""

import pytest
import time
import tempfile
from pathlib import Path
import sys
import numpy as np
sys.path.append(str(Path(__file__).parent.parent.parent))

from core import MemoryBankChunker, LocalEmbedder, HybridSearcher
from core.chunker import Chunk


@pytest.fixture
def test_config():
    """Create test configuration"""
    with tempfile.TemporaryDirectory() as tmpdir:
        return {
            'model': {
                'name': 'sentence-transformers/all-MiniLM-L6-v2',
                'device': 'cpu',
                'batch_size': 32
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
                'memory_bank_root': '../../memory-bank',
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


def test_query_latency_p95(test_config):
    """Test P95 query latency <500ms requirement"""
    # Setup
    chunker = MemoryBankChunker(test_config)
    embedder = LocalEmbedder(test_config)
    searcher = HybridSearcher(test_config, embedder)
    searcher.create_or_load_collection()
    
    # Create test data
    test_chunks = []
    for i in range(100):  # Create 100 test chunks
        chunk = Chunk(
            chunk_id=f'perf{i}',
            document_path=f'test{i//10}.md',
            section_header=f'Section {i}',
            content=f'Performance test content {i} with various keywords for search',
            navigation_path=f'test.md → Section {i}',
            start_line=i*10,
            end_line=(i+1)*10,
            metadata={'size_category': '🟢'}
        )
        test_chunks.append(chunk)
    
    # Add chunks to index
    embeddings = embedder.embed_chunks(test_chunks)
    searcher.add_chunks(test_chunks, embeddings)
    
    # Perform multiple queries and measure latency
    queries = [
        "performance test",
        "content keywords",
        "search various",
        "section navigation",
        "test documentation"
    ]
    
    latencies = []
    for _ in range(20):  # Run each query 4 times
        for query in queries:
            start = time.time()
            results = searcher.search(query)
            latency = (time.time() - start) * 1000  # Convert to ms
            latencies.append(latency)
    
    # Calculate P95
    p95 = np.percentile(latencies, 95)
    
    # Should meet target
    assert p95 < 500, f"P95 latency {p95:.2f}ms exceeds 500ms target"
    
    # Also check mean and median
    mean_latency = np.mean(latencies)
    median_latency = np.median(latencies)
    
    print(f"Query Performance:")
    print(f"  P95: {p95:.2f}ms")
    print(f"  Mean: {mean_latency:.2f}ms")
    print(f"  Median: {median_latency:.2f}ms")


def test_indexing_throughput(test_config):
    """Test indexing speed"""
    chunker = MemoryBankChunker(test_config)
    embedder = LocalEmbedder(test_config)
    
    # Create test documents
    test_docs = []
    for i in range(10):
        content = f"# Document {i}\n"
        content += "## Section 1\n" + '\n'.join(['Content line'] * 100)
        content += "\n## Section 2\n" + '\n'.join(['More content'] * 100)
        test_docs.append((f"doc{i}.md", content))
    
    # Measure indexing time
    start = time.time()
    
    all_chunks = []
    for file_path, content in test_docs:
        chunks = chunker.chunk_document(file_path, content)
        all_chunks.extend(chunks)
    
    embeddings = embedder.embed_chunks(all_chunks)
    
    duration = time.time() - start
    
    # Calculate throughput
    docs_per_second = len(test_docs) / duration
    chunks_per_second = len(all_chunks) / duration
    
    print(f"Indexing Performance:")
    print(f"  Documents: {len(test_docs)} in {duration:.2f}s")
    print(f"  Chunks: {len(all_chunks)} in {duration:.2f}s")
    print(f"  Throughput: {docs_per_second:.2f} docs/s, {chunks_per_second:.2f} chunks/s")
    
    # Should process at least 1 document per second
    assert docs_per_second > 1.0, f"Indexing too slow: {docs_per_second:.2f} docs/s"


def test_memory_usage():
    """Test memory consumption stays reasonable"""
    try:
        import psutil
    except ImportError:
        pytest.skip("psutil not installed")
    import gc
    
    process = psutil.Process()
    gc.collect()
    
    initial_memory = process.memory_info().rss / 1024 / 1024  # MB
    
    # Create large test configuration
    with tempfile.TemporaryDirectory() as tmpdir:
        config = {
            'model': {
                'name': 'sentence-transformers/all-MiniLM-L6-v2',
                'device': 'cpu',
                'batch_size': 32
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
                'memory_bank_root': '../../memory-bank',
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
        
        # Initialize components
        chunker = MemoryBankChunker(config)
        embedder = LocalEmbedder(config)
        searcher = HybridSearcher(config, embedder)
        searcher.create_or_load_collection()
        
        # Process many chunks
        chunks = []
        for i in range(500):  # Create 500 chunks
            chunk = Chunk(
                chunk_id=f'mem{i}',
                document_path=f'test{i//50}.md',
                section_header=f'Section {i}',
                content=f'Memory test content {i} ' * 50,  # Larger content
                navigation_path=f'test.md → Section {i}',
                start_line=i*10,
                end_line=(i+1)*10,
                metadata={'size_category': '🟢'}
            )
            chunks.append(chunk)
        
        # Generate embeddings and add to index
        embeddings = embedder.embed_chunks(chunks)
        searcher.add_chunks(chunks, embeddings)
        
        # Perform searches
        for i in range(10):
            searcher.search(f"memory test {i}")
    
    gc.collect()
    final_memory = process.memory_info().rss / 1024 / 1024  # MB
    memory_increase = final_memory - initial_memory
    
    print(f"Memory Usage:")
    print(f"  Initial: {initial_memory:.2f}MB")
    print(f"  Final: {final_memory:.2f}MB")
    print(f"  Increase: {memory_increase:.2f}MB")
    
    # Should use less than 500MB additional
    assert memory_increase < 500, f"Memory usage too high: {memory_increase:.2f}MB"


def test_concurrent_queries(test_config):
    """Test handling of concurrent queries"""
    import concurrent.futures
    
    # Setup
    chunker = MemoryBankChunker(test_config)
    embedder = LocalEmbedder(test_config)
    searcher = HybridSearcher(test_config, embedder)
    searcher.create_or_load_collection()
    
    # Add test data
    chunks = []
    for i in range(50):
        chunk = Chunk(
            chunk_id=f'conc{i}',
            document_path=f'test{i//10}.md',
            section_header=f'Section {i}',
            content=f'Concurrent test content {i}',
            navigation_path=f'test.md → Section {i}',
            start_line=i,
            end_line=i+1,
            metadata={'size_category': '🟢'}
        )
        chunks.append(chunk)
    
    embeddings = embedder.embed_chunks(chunks)
    searcher.add_chunks(chunks, embeddings)
    
    # Function to run query
    def run_query(query_num):
        query = f"concurrent test {query_num % 5}"
        start = time.time()
        results = searcher.search(query)
        latency = (time.time() - start) * 1000
        return latency, len(results)
    
    # Run concurrent queries
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(run_query, i) for i in range(20)]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]
    
    latencies = [r[0] for r in results]
    result_counts = [r[1] for r in results]
    
    # All queries should complete successfully
    assert all(count > 0 for count in result_counts), "Some queries returned no results"
    
    # Check performance under concurrent load
    mean_latency = np.mean(latencies)
    max_latency = np.max(latencies)
    
    print(f"Concurrent Query Performance (5 workers, 20 queries):")
    print(f"  Mean latency: {mean_latency:.2f}ms")
    print(f"  Max latency: {max_latency:.2f}ms")
    
    # Even under concurrent load, should maintain reasonable performance
    assert mean_latency < 1000, f"Mean latency under load too high: {mean_latency:.2f}ms"