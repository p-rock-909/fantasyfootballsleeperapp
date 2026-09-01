# MBIE Test Suite

**Test Framework:** pytest
**Coverage Target:** >85%
**Test Count:** 127 tests across 11 test files

---

## Running Tests

### From tools/memory_rag Directory (Recommended)

```bash
cd tools/memory_rag

# Run all tests
python3 -m pytest tests/

# Run with verbose output
python3 -m pytest tests/ -v

# Run with coverage
python3 -m pytest tests/ --cov=. --cov-report=html

# Run specific test file
python3 -m pytest tests/test_core.py

# Run specific test
python3 -m pytest tests/test_core.py::test_chunker_initialization
```

### From Repository Root

```bash
# From repository root, use absolute imports
python3 -m pytest tools/memory_rag/tests/

# This works but may be slower due to path resolution
```

---

## Import Path Strategy

### Context
MBIE uses **relative imports** when tests run from `tools/memory_rag/` directory:
```python
from core.chunker import MemoryBankChunker  # Relative import
```

This is intentional for:
- **CI/CD consistency:** GitHub Actions runs from this directory
- **Local development:** Simplifies pytest discovery
- **Package isolation:** Doesn't require package installation for basic tests

### Why Tests Changed from Absolute to Relative Imports

**Original (Broken in CI):**
```python
from tools.memory_rag.core.chunker import MemoryBankChunker
```

**Current (Works in CI and locally):**
```python
from core.chunker import MemoryBankChunker
```

**Reason:** CI runs from `tools/memory_rag/` directory, where `tools.memory_rag` module doesn't exist in Python path.

---

## Test Organization

```
tests/
├── test_core.py                    # Core components (chunker, embedder, searcher)
├── test_chunker_only.py            # Focused chunker tests
├── test_business_intelligence.py   # Business intelligence features
├── test_comprehensive_docs.py      # Documentation processing
├── test_edge_cases.py              # Edge cases and error handling
├── test_enhanced_config.py         # Configuration management
├── test_integration.py             # Integration tests
├── test_without_embeddings.py      # Tests without model dependencies
├── test_config_validation.py       # Config validation
├── test_error_handling.py          # Error handling
└── test_utils.py                   # Utility functions
```

---

## Test Categories

### Unit Tests (Fast)
Test individual components in isolation.

**Files:**
- `test_core.py`
- `test_chunker_only.py`
- `test_config_validation.py`
- `test_error_handling.py`
- `test_utils.py`

**Run only unit tests:**
```bash
python3 -m pytest tests/test_core.py tests/test_chunker_only.py tests/test_config_validation.py tests/test_error_handling.py tests/test_utils.py
```

### Integration Tests (Slower)
Test multiple components working together.

**Files:**
- `test_integration.py`
- `test_business_intelligence.py`
- `test_comprehensive_docs.py`

**Run only integration tests:**
```bash
python3 -m pytest tests/test_integration.py tests/test_business_intelligence.py tests/test_comprehensive_docs.py
```

### Tests Without Model Dependencies
Tests that don't require downloading ML models (fast for CI).

**File:** `test_without_embeddings.py`

**Run model-free tests:**
```bash
python3 -m pytest tests/test_without_embeddings.py
```

---

## Test Configuration

### Fixtures (`conftest.py`)
Common test fixtures available in all tests:

```python
@pytest.fixture
def test_config():
    """Minimal test configuration"""
    return {
        'memory_bank_path': '/tmp/test_memory_bank',
        'chunk_size': 512,
        'model': {'name': 'sentence-transformers/all-MiniLM-L6-v2'}
    }

@pytest.fixture
def test_documents():
    """Sample documents for testing"""
    return [...]
```

### Test Data Location
- **Config files:** `tests/fixtures/test_config.yml`
- **Sample docs:** Created in fixtures or `conftest.py`
- **Temporary data:** Uses `tempfile.TemporaryDirectory()`

---

## CI/CD Testing

### GitHub Actions Configuration
**File:** `.github/workflows/mbie-ci.yml`

**Matrix Testing:**
- Python 3.9, 3.10, 3.11
- Ubuntu latest (Linux)

**Steps:**
1. Checkout code
2. Set up Python
3. Install dependencies from `requirements_latest_stable.txt`
4. Run linters (flake8, black, mypy, ruff)
5. Run security scan (bandit)
6. Run test suite with coverage
7. Upload coverage reports

### Running Tests Exactly Like CI

```bash
cd tools/memory_rag

# Install exact dependencies
pip install -r requirements_latest_stable.txt

# Run linters
flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
black --check .
mypy . --ignore-missing-imports

# Run security scan
bandit -r . -ll

# Run tests with coverage
pytest tests/ --cov=. --cov-report=term-missing
```

---

## Coverage Reports

### Generate HTML Coverage Report
```bash
python3 -m pytest tests/ --cov=. --cov-report=html

# Open in browser
open htmlcov/index.html  # macOS
xdg-open htmlcov/index.html  # Linux
start htmlcov/index.html  # Windows
```

### Coverage Targets
- **Overall:** >85%
- **core/:** >90% (critical components)
- **cli.py:** >80% (user-facing)
- **integrations/:** >75% (external dependencies)

### Current Coverage (as of v1.0.0)
```
core/chunker.py         92%
core/embedder.py        89%
core/searcher.py        91%
core/intelligence.py    87%
cli.py                  85%
Overall                 87%
```

---

## Writing New Tests

### Test Naming Convention
```python
def test_[component]_[behavior]_[condition]:
    """Tests that [component] [behavior] when [condition]"""
    pass
```

**Examples:**
```python
def test_chunker_splits_document_into_sections():
    """Tests that chunker splits document into logical sections"""

def test_searcher_returns_empty_list_when_no_results():
    """Tests that searcher returns empty list when no results found"""

def test_config_validation_raises_error_for_missing_required_fields():
    """Tests that config validation raises error for missing required fields"""
```

### Test Structure (AAA Pattern)
```python
def test_example():
    # Arrange: Set up test data and dependencies
    config = load_test_config()
    chunker = MemoryBankChunker(config)
    document = create_test_document()

    # Act: Execute the code being tested
    result = chunker.chunk_document(document)

    # Assert: Verify the results
    assert len(result) > 0
    assert all(chunk['content'] for chunk in result)
```

### Mocking External Dependencies
```python
from unittest.mock import Mock, patch

def test_with_mocked_embedder():
    with patch('core.embedder.LocalEmbedder') as mock_embedder:
        mock_embedder.return_value.generate_embedding.return_value = [0.1] * 384
        # Test code here
```

---

## Common Test Issues

### Issue: Tests fail with `ModuleNotFoundError: No module named 'core'`
**Solution:** Run from `tools/memory_rag/` directory
```bash
cd tools/memory_rag
python3 -m pytest tests/
```

### Issue: Tests pass locally but fail in CI
**Causes:**
1. Different Python version
2. Missing dependencies
3. Path differences

**Solution:**
```bash
# Test with exact CI configuration
python3 -m pip install -r requirements_latest_stable.txt
cd tools/memory_rag
python3 -m pytest tests/
```

### Issue: `FileNotFoundError` in tests
**Cause:** Tests expecting files in different locations

**Solution:** Use `tempfile` for test data:
```python
import tempfile

def test_with_temp_file():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create test files in tmpdir
        # Run test
        # tmpdir auto-cleaned up
```

### Issue: Slow test execution
**Causes:**
1. Loading ML models repeatedly
2. Creating embeddings in every test
3. No test parallelization

**Solutions:**
```bash
# Use pytest-xdist for parallel execution
pip install pytest-xdist
python3 -m pytest tests/ -n auto

# Skip slow tests during development
python3 -m pytest tests/ -m "not slow"
```

---

## Test Markers

### Mark Slow Tests
```python
import pytest

@pytest.mark.slow
def test_full_indexing():
    """This test is slow, skip during quick development cycles"""
    pass
```

Run without slow tests:
```bash
python3 -m pytest tests/ -m "not slow"
```

### Mark Integration Tests
```python
@pytest.mark.integration
def test_end_to_end_workflow():
    """Integration test - requires full system"""
    pass
```

Run only integration tests:
```bash
python3 -m pytest tests/ -m "integration"
```

---

## Debugging Tests

### Run with Debug Output
```bash
# Verbose output
python3 -m pytest tests/ -vv

# Show print statements
python3 -m pytest tests/ -s

# Stop on first failure
python3 -m pytest tests/ -x

# Drop into debugger on failure
python3 -m pytest tests/ --pdb
```

### Use pytest's built-in debugger
```python
def test_with_debugging():
    result = some_function()
    import pdb; pdb.set_trace()  # Debugger starts here
    assert result == expected
```

---

## Performance Testing

### Benchmark Tests
```bash
# Install pytest-benchmark
pip install pytest-benchmark

# Run benchmark tests
python3 -m pytest tests/ --benchmark-only
```

### Memory Profiling
```bash
# Install memory-profiler
pip install memory-profiler

# Profile specific test
python3 -m memory_profiler -m pytest tests/test_core.py::test_chunker
```

---

## Test Data Management

### Best Practices
1. **Use fixtures** for reusable test data
2. **Use `tempfile`** for file operations
3. **Clean up** after tests (use context managers)
4. **Mock external dependencies** (APIs, file systems)
5. **Keep test data small** (use minimal examples)

### Example Test Data
```python
@pytest.fixture
def sample_markdown():
    return """
# Test Document

## Section 1
Content for section 1.

## Section 2
Content for section 2.
"""

@pytest.fixture
def sample_config():
    return {
        'memory_bank_path': '/tmp/test',
        'chunk_size': 512,
        'model': {'name': 'sentence-transformers/all-MiniLM-L6-v2'}
    }
```

---

## Continuous Testing

### Watch Mode (requires pytest-watch)
```bash
pip install pytest-watch

# Auto-run tests on file changes
cd tools/memory_rag
ptw tests/
```

### Pre-commit Hook
```bash
# Add to .git/hooks/pre-commit
#!/bin/bash
cd tools/memory_rag
python3 -m pytest tests/
if [ $? -ne 0 ]; then
    echo "Tests failed. Commit aborted."
    exit 1
fi
```

---

## Additional Resources

- **pytest Documentation:** https://docs.pytest.org/
- **Coverage.py:** https://coverage.readthedocs.io/
- **Python Testing Best Practices:** https://realpython.com/pytest-python-testing/

---

**Questions or Issues?**
- Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- Create issue: https://github.com/virtuoso902/Template/issues
