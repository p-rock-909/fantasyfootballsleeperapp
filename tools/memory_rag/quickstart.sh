#!/bin/bash

# MBIE Quick Start Script
# Automated setup for Memory-Bank Intelligence Engine

set -e  # Exit on error

echo "🚀 MBIE Quick Start"
echo "===================="
echo ""

# Check Python version
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python not found"
    echo "Please install Python 3.9+ from https://python.org"
    exit 1
fi

PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}')
echo "✓ Found Python $PYTHON_VERSION"

# Check if Python version is compatible (3.9-3.11)
MAJOR_VERSION=$(echo $PYTHON_VERSION | cut -d. -f1)
MINOR_VERSION=$(echo $PYTHON_VERSION | cut -d. -f2)

if [ "$MAJOR_VERSION" -ne 3 ] || [ "$MINOR_VERSION" -lt 9 ]; then
    echo "⚠️  Warning: Python $PYTHON_VERSION may not be compatible"
    echo "   Recommended: Python 3.9, 3.10, or 3.11"
    read -p "   Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""

# Create virtual environment
if [ -d "mbie_env" ]; then
    echo "✓ Virtual environment already exists: mbie_env"
    read -p "  Recreate it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf mbie_env
        echo "  Creating new virtual environment..."
        $PYTHON_CMD -m venv mbie_env
    fi
else
    echo "→ Creating virtual environment: mbie_env"
    $PYTHON_CMD -m venv mbie_env
fi

# Activate virtual environment
echo "→ Activating virtual environment..."
source mbie_env/bin/activate

# Upgrade pip
echo "→ Upgrading pip..."
pip install --upgrade pip --quiet

# Install dependencies
echo "→ Installing dependencies from requirements_latest_stable.txt..."
pip install -r requirements_latest_stable.txt --quiet

# Install MBIE in development mode
echo "→ Installing MBIE in development mode..."
pip install -e . --quiet

# Create config from template if it doesn't exist
if [ ! -f "config.yml" ]; then
    echo "→ Creating config.yml from template..."
    cp config.yml.template config.yml
    echo "  ✓ Created config.yml (edit paths if needed)"
else
    echo "✓ config.yml already exists"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo ""
echo "1. Activate virtual environment (if not already active):"
echo "   source mbie_env/bin/activate"
echo ""
echo "2. Edit configuration if needed:"
echo "   vim config.yml"
echo ""
echo "3. Index your memory-bank:"
echo "   python3 cli.py index"
echo ""
echo "4. Try a query:"
echo "   python3 cli.py query \"your search term\" --top-k 5"
echo ""
echo "5. View statistics:"
echo "   python3 cli.py stats"
echo ""
echo "📚 Documentation:"
echo "   - README.md - Complete usage guide"
echo "   - TROUBLESHOOTING.md - Common issues and solutions"
echo "   - DEPENDENCIES.md - Dependency information"
echo ""
echo "❓ Need help? Create an issue:"
echo "   https://github.com/virtuoso902/Template/issues"
echo ""
echo "Happy querying! 🎉"
