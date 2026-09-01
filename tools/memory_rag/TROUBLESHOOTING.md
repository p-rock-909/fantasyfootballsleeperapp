# MBIE Troubleshooting Guide

**Last Updated:** 2025-10-14

Quick solutions to common MBIE issues.

---

## Installation Issues

### Error: `cannot import name 'list_repo_tree' from 'huggingface_hub'`

**Cause:** Old version of huggingface_hub with incompatible API

**Solution:**
```bash
pip install --upgrade huggingface_hub==0.16.4
```

---

### Error: `Could not find a version that satisfies the requirement sentence-transformers==2.7.0`

**Cause:** Python version too new (3.12+) or too old (<3.9)

**Solution:**
```bash
# Check Python version
python3 --version

# If not 3.9-3.11, install compatible version
# On macOS with homebrew:
brew install python@3.11

# Or use pyenv:
pyenv install 3.11.0
pyenv local 3.11.0
```

---

### Error: `ModuleNotFoundError: No module named 'mbie'`

**Cause:** Package not installed or virtual environment not activated

**Solution:**
```bash
# Install in development mode
cd tools/memory_rag
python3 -m pip install -e .

# Or use quickstart
./quickstart.sh
```

---

### Error: torch installation fails on Mac

**Cause:** ARM Mac (M1/M2/M3) compatibility issue

**Solution:**
```bash
# Install specific torch version
pip install torch==2.0.1

# Or try pre-release
pip install --pre torch
```

---

## Runtime Issues

### Error: `Collection not found: memory_bank`

**Cause:** Index not created or ChromaDB data deleted

**Solution:**
```bash
# Create index
python3 cli.py index

# Check index location
ls -la ../../memory-bank/.rag/
```

---

### Error: `No module named 'tools'` when running tests

**Cause:** Running tests from wrong directory with absolute imports

**Solution:**
```bash
# Run from tools/memory_rag directory
cd tools/memory_rag
python3 -m pytest tests/

# NOT from repository root
```

---

### Query returns 0 results

**Cause 1:** Index is empty
```bash
# Check statistics
python3 cli.py stats

# If 0 documents, reindex
python3 cli.py index
```

**Cause 2:** Query too specific
```bash
# Try broader query
python3 cli.py query "general topic" --top-k 10
```

**Cause 3:** Memory-bank path incorrect
```bash
# Check config.yml
cat config.yml | grep memory_bank_path

# Should point to: ../../memory-bank
```

---

### Slow query performance (>10 seconds)

**Cause:** Large index or cold start (model loading)

**Solution:**
```bash
# First query always slower (model loading)
# Subsequent queries should be <2 seconds

# Check index size
python3 cli.py stats

# If >10,000 documents, consider optimization:
# - Reduce chunk size in config.yml
# - Use domain filtering: --domain business
# - Limit results: --top-k 5
```

---

## Configuration Issues

### Error: `config.yml not found`

**Cause:** Running from wrong directory or config not created

**Solution:**
```bash
# Copy template
cp config.yml.template config.yml

# Edit paths if needed
vim config.yml
```

---

### Memory-bank path not found

**Cause:** Relative path incorrect for your directory structure

**Solution:**
```bash
# Check current directory
pwd

# Should be in: /path/to/repo/tools/memory_rag

# Memory-bank should be at: /path/to/repo/memory-bank

# Update config.yml if structure different
memory_bank_path: "../../memory-bank"  # Adjust as needed
```

---

## Dependency Conflicts

### Error: `sentence-transformers 2.7.0 depends on transformers>=4.34.0`

**Cause:** Old transformers version installed

**Solution:**
```bash
pip install transformers==4.34.0
```

---

### Error: `transformers 4.34.0 depends on tokenizers>=0.14`

**Cause:** Old tokenizers version

**Solution:**
```bash
pip install tokenizers==0.14.0
```

---

### Error: Multiple dependency conflicts

**Cause:** Mixed versions from different installations

**Solution:**
```bash
# Clean install
pip uninstall mbie sentence-transformers transformers tokenizers -y
pip install -r requirements_latest_stable.txt
pip install -e .
```

---

## Test Failures

### Tests fail with import errors

**Cause:** Wrong working directory or import paths

**Solution:**
```bash
# Run from correct directory
cd tools/memory_rag
python3 -m pytest tests/

# Check PYTHONPATH
echo $PYTHONPATH  # Should include current directory
```

---

### Tests pass locally but fail in CI

**Cause:** Environment differences (paths, dependencies)

**Solution:**
```bash
# Check CI logs for specific error
gh pr checks

# Common issues:
# 1. Different Python version
# 2. Missing dependencies
# 3. Path differences (absolute vs relative)
```

---

## Performance Issues

### High memory usage (>2GB)

**Cause:** Large model loaded + large index

**Solutions:**
```bash
# Option 1: Use smaller model
# Edit config.yml:
model:
  name: "sentence-transformers/all-MiniLM-L6-v2"  # Smaller model

# Option 2: Reduce index size
# Process fewer documents at once

# Option 3: Clear cache
rm -rf ../../memory-bank/.rag/
python3 cli.py index
```

---

### Indexing is very slow

**Cause:** Large files or network latency (downloading models)

**Solutions:**
```bash
# Check if model is downloaded
ls ~/.cache/torch/sentence_transformers/

# If not, download once:
python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

# For large files:
# - Increase chunk_size in config.yml
# - Use incremental indexing (automatic)
```

---

## ChromaDB Issues

### Error: `ChromaDB connection failed`

**Cause:** ChromaDB data corrupted or permissions issue

**Solution:**
```bash
# Check permissions
ls -la ../../memory-bank/.rag/

# If corrupted, rebuild:
rm -rf ../../memory-bank/.rag/
python3 cli.py index
```

---

### Warning: `Telemetry event failed`

**Cause:** ChromaDB telemetry issues (harmless)

**Solution:**
This warning is cosmetic and doesn't affect functionality. To suppress:
```python
# Edit config.yml or set environment variable
export CHROMA_TELEMETRY=false
```

---

## SSL/Certificate Warnings

### Warning: `urllib3 v2 only supports OpenSSL 1.1.1+`

**Cause:** System OpenSSL version mismatch

**Solution:**
This warning is non-blocking. To fix:
```bash
# Option 1: Downgrade urllib3
pip install 'urllib3<2'

# Option 2: Upgrade system OpenSSL (macOS)
brew install openssl@1.1
```

---

## Common User Errors

### Forgetting to activate virtual environment

**Symptom:** `command not found: mbie` or imports fail

**Solution:**
```bash
# Activate venv
source mbie_env/bin/activate  # Linux/Mac
mbie_env\Scripts\activate     # Windows

# Verify
which python  # Should show venv path
```

---

### Running commands from wrong directory

**Symptom:** Various path-related errors

**Solution:**
```bash
# Always run from tools/memory_rag/
cd /path/to/repo/tools/memory_rag

# Then run commands
python3 cli.py index
```

---

### Not updating index after documentation changes

**Symptom:** Query returns old results

**Solution:**
```bash
# Reindex after documentation updates
python3 cli.py index

# Index is incremental - only processes changed files
```

---

## Getting Help

### Collect Diagnostic Information

```bash
# System info
python3 --version
pip --version
uname -a  # or systeminfo on Windows

# Package versions
pip list | grep -E "(sentence|transform|chroma)"

# MBIE info
python3 -c "import mbie; print(mbie.__version__)"

# Index status
python3 cli.py stats

# Config
cat config.yml
```

### Where to Report Issues

1. **Check existing issues:** https://github.com/virtuoso902/Template/issues
2. **Create new issue** with diagnostic info above
3. **Include:** Error message, command run, expected vs actual behavior

---

## Prevention Tips

### 1. Always use virtual environments
```bash
python3 -m venv mbie_env
source mbie_env/bin/activate
```

### 2. Pin dependencies
Use `requirements_latest_stable.txt` - don't install latest of everything

### 3. Test locally before CI
```bash
# Run full test suite locally
python3 -m pytest tests/
python3 cli.py index
python3 cli.py query "test"
```

### 4. Keep documentation in sync
Update memory-bank → Reindex → Test queries

### 5. Monitor index size
```bash
# Check periodically
python3 cli.py stats

# If too large, consider pruning old documents
```

---

## Advanced Troubleshooting

### Enable Debug Logging

```python
# Add to cli.py or create debug config
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Profile Performance

```bash
# Time indexing
time python3 cli.py index

# Time queries
time python3 cli.py query "test" --top-k 10

# Memory profiling
python3 -m memory_profiler cli.py index
```

### Validate Index Integrity

```bash
# Check index statistics
python3 cli.py stats

# Try querying each domain
python3 cli.py query "test" --domain business
python3 cli.py query "test" --domain automation
python3 cli.py query "test" --domain health
python3 cli.py query "test" --domain philosophy
```

---

**Still stuck?** Create an issue with:
- Exact error message
- Command you ran
- Output of diagnostic commands above
- Python and OS version

We'll help you debug!
