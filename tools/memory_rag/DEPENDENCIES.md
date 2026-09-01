# MBIE Dependencies

**Last Updated:** 2025-10-14
**MBIE Version:** 1.0.0

---

## Tested Configurations

### Python 3.9 ✅
```
sentence-transformers==2.7.0
chromadb==0.4.22
transformers==4.34.0
huggingface_hub==0.16.4
tokenizers==0.14.0
torch==2.0.1
click==8.1.7
pyyaml==6.0.1
python-dotenv==1.0.0
rich==13.7.0
numpy==1.24.3
tqdm==4.66.1
watchfiles==0.21.0
```

### Python 3.10 ✅
Same versions as Python 3.9 - fully compatible.

### Python 3.11 ✅
Same versions as Python 3.9 - fully compatible.

---

## Dependency Resolution Journey

This project went through 7 commits to resolve dependency conflicts. Here's what we learned:

### Iteration 1-2: Initial Yanked Package Issue
**Problem:** `huggingface_hub==0.16.0` was yanked from PyPI
**Solution:** Updated to `huggingface_hub==0.16.4`

### Iteration 3-4: Transformers Version Conflict
**Problem:**
```
sentence-transformers 2.7.0 depends on transformers<5.0.0 and >=4.34.0
transformers 4.30.0 does not satisfy >=4.34.0
```
**Solution:** Updated to `transformers==4.34.0`

### Iteration 5-6: Tokenizers Version Conflict
**Problem:**
```
transformers 4.34.0 depends on tokenizers<0.15 and >=0.14
tokenizers 0.13.3 does not satisfy >=0.14
```
**Solution:** Updated to `tokenizers==0.14.0`

### Iteration 7: Test Import Path Fixes
**Problem:** Tests using `from tools.memory_rag.core` failed in CI
**Solution:** Changed to relative imports `from core` when running from tools/memory_rag/

---

## Known Dependency Conflicts

### sentence-transformers 3.x Breaking Changes
**Issue:** sentence-transformers 3.x has breaking API changes
**Impact:** Our code is written for 2.x API
**Resolution:** Pin to `sentence-transformers==2.7.0` (last stable 2.x version)

### transformers Minimum Version
**Issue:** sentence-transformers 2.7.0 requires transformers>=4.34.0
**Impact:** Older transformers versions will fail
**Resolution:** Must use `transformers==4.34.0` or newer (but <5.0.0)

### tokenizers Version Range
**Issue:** transformers 4.34.0 requires tokenizers>=0.14 and <0.15
**Impact:** Narrow version range for compatibility
**Resolution:** Use exactly `tokenizers==0.14.0`

### huggingface_hub API Changes
**Issue:** Newer versions (>0.20) may have different APIs
**Impact:** Import paths and function signatures changed
**Resolution:** Pin to `huggingface_hub==0.16.4` (tested stable version)

### torch Version for ARM Mac
**Issue:** torch 2.1+ may have compatibility issues on ARM Macs
**Impact:** Installation failures on M1/M2/M3 Macs
**Resolution:** Use `torch==2.0.1` for maximum compatibility

---

## Installation Methods

### Method 1: Using requirements_latest_stable.txt (Recommended)
```bash
cd tools/memory_rag
python3 -m pip install -r requirements_latest_stable.txt
python3 -m pip install -e .
```

This installs exact tested versions with known compatibility.

### Method 2: Using setup.py (Development)
```bash
cd tools/memory_rag
python3 -m pip install -e .
```

This reads requirements from requirements_latest_stable.txt automatically.

### Method 3: Quick Start Script
```bash
cd tools/memory_rag
./quickstart.sh
```

Automated setup with virtual environment creation.

---

## Dependency Tree

```
mbie
├── sentence-transformers==2.7.0
│   ├── transformers>=4.34.0,<5.0.0
│   │   ├── tokenizers>=0.14,<0.15
│   │   ├── huggingface_hub>=0.16.4,<1.0
│   │   ├── numpy>=1.17
│   │   └── tqdm>=4.27
│   ├── torch>=2.0.0
│   └── numpy>=1.17
├── chromadb==0.4.22
│   ├── onnxruntime>=1.14.1
│   ├── chroma-hnswlib==0.7.3
│   └── [many other dependencies]
├── click==8.1.7
├── pyyaml==6.0.1
├── python-dotenv==1.0.0
├── rich==13.7.0
├── tqdm==4.66.1
└── watchfiles==0.21.0
```

---

## Platform-Specific Notes

### macOS (ARM - M1/M2/M3)
- torch 2.0.1 works well on ARM Macs
- May see warnings about OpenSSL (non-blocking)
- Use Python 3.9-3.11 from official python.org installer

### macOS (Intel)
- All versions work as expected
- No special considerations

### Linux
- All versions work as expected
- Ensure system has required build tools for compiled packages
- May need: `apt-get install build-essential python3-dev`

### Windows
- All versions should work
- May need Visual C++ Build Tools for some packages
- Use Windows Terminal or PowerShell for best experience

---

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed error resolution guides.

### Quick Fixes

**Problem:** `ImportError: cannot import name 'list_repo_tree'`
**Solution:** Update huggingface_hub to 0.16.4+

**Problem:** `ERROR: Could not find a version that satisfies the requirement`
**Solution:** Use Python 3.9-3.11 (not 3.12+)

**Problem:** `ModuleNotFoundError: No module named 'tools'`
**Solution:** Run tests from tools/memory_rag/ directory, not repository root

**Problem:** torch installation fails on Mac
**Solution:** Use `pip install --pre torch` for latest pre-release

---

## Upgrading Dependencies

### When to Upgrade
- Security vulnerabilities reported
- Bug fixes in upstream packages
- New features needed from newer versions

### How to Upgrade Safely
1. Create new virtual environment for testing
2. Update one package at a time
3. Run full test suite after each update
4. Document any breaking changes
5. Update this file with new tested configuration

### Major Version Upgrades
- sentence-transformers 2.x → 3.x: **Breaking changes** - requires code updates
- transformers 4.x → 5.x: **Breaking changes** - wait for sentence-transformers support
- chromadb 0.4.x → 0.5.x: **API changes** - test thoroughly before upgrading

---

## Development Dependencies

Additional dependencies for development (not required for production use):

```
pytest==7.4.4
pytest-cov==4.1.0
black==23.12.1
ruff==0.1.11
mypy==1.8.0
```

These are included in requirements_latest_stable.txt for comprehensive development setup.

---

## Minimal Dependencies

For production deployments where size matters, the absolute minimum is:

```
sentence-transformers==2.7.0
chromadb==0.4.22
click==8.1.7
pyyaml==6.0.1
rich==13.7.0
```

This gives you core MBIE functionality without development tools.

See `requirements_minimal.txt` for minimal installation.

---

**Maintainer Notes:**
- Test all dependency updates in CI before merging
- Keep this file updated with any version changes
- Document reasons for pinning specific versions
- Include Python version compatibility matrix
