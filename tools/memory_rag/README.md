# MBIE - Memory-Bank Intelligence Engine

**Status:** Production Ready
**Version:** 1.0.0
**Purpose:** Intelligent documentation retrieval with semantic search and priority scoring

> **Note:** MBIE is a general-purpose RAG (Retrieval-Augmented Generation) system that works with any markdown documentation. The memory-bank framework structure included in this template is optional - MBIE will index and search any markdown files you point it to via `config.yml`.

## Quick Start

### Installation

```bash
# Install MBIE in your project
cd your-project
mkdir -p tools
cp -r /path/to/mbie tools/memory_rag

# Setup virtual environment
cd tools/memory_rag
python3 -m venv mbie_env
source mbie_env/bin/activate
pip install -r requirements_latest_stable.txt
```

### First Run

```bash
# Option 1: Interactive setup wizard
python cli.py quickstart

# Option 2: Manual setup
# 1. Copy config template
cp config.yml.template config.yml

# 2. Edit config.yml with your paths
# 3. Run initial index
python cli.py index --full
```

### Basic Usage

```bash
# Search your documentation
python cli.py query "search term"

# Filter by status
python cli.py query "tasks" --status in_progress

# Current/urgent items only
python cli.py query "priorities" --current-only --urgent-only

# View stats
python cli.py stats
```

## Features

- ✅ **Semantic Search**: Natural language understanding
- ✅ **Priority Scoring**: Intelligent relevance ranking
- ✅ **Status Awareness**: Filter by completion state
- ✅ **Temporal Context**: Time-aware search
- ✅ **Multi-Domain**: Customizable knowledge domains
- ✅ **Adaptive Learning**: Self-improving intelligence

## Configuration

Edit `config.yml` to customize:

```yaml
# Point to your documentation
storage:
  memory_bank_root: "../../memory-bank"
  additional_sources:
    - "../../docs/"

# Define knowledge domains
domains:
  current_work:
    boost: 2.0
    keywords: ["urgent", "priority"]
```

See `config.yml.template` for full configuration options.

## CLI Commands

```bash
# Indexing
index --full              # Complete reindex
index --incremental       # Update changed files

# Searching
query "term"              # Basic search
query "term" --current-only
query "term" --status pending
query "term" --urgent-only

# Management
stats                     # Statistics
backup                    # Backup index
restore                   # Restore index
evaluate                  # Quality check
```

## Architecture

- **Embedder**: sentence-transformers (all-MiniLM-L6-v2)
- **Vector Store**: ChromaDB (local)
- **Search**: Hybrid semantic + keyword
- **Intelligence**: Priority scoring + context awareness

## Performance

- Query latency: <500ms (p95)
- Scales to 500+ documents
- Memory: ~500MB

## Deployment

### Self-Service
```bash
pip install git+https://github.com/NoCapLife/mbie.git
mbie quickstart
```

### Docker
```bash
docker run -v /docs:/docs nocaplife/mbie query "search"
```

## Testing

```bash
pytest tests/
pytest tests/ --cov=core
```

## License

MIT License

---

For detailed documentation, see `/docs` directory.
