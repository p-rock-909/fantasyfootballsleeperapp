#!/usr/bin/env python3
"""
MBIE Command Line Interface - Main Entry Point

Fixes import issues when running directly.
"""

import sys
from pathlib import Path

# Add the current directory to sys.path to fix imports
sys.path.insert(0, str(Path(__file__).parent))

from cli import main

if __name__ == '__main__':
    main()