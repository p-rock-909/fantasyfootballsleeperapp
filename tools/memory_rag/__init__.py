"""
Memory-Bank Intelligence Engine (MBIE)

A local-first RAG system for Randy's memory-bank documentation.
"""

__version__ = "0.1.0"
__author__ = "Randy Nguyen"

from .core.chunker import MemoryBankChunker
from .core.embedder import LocalEmbedder
from .core.searcher import HybridSearcher
from .cli import main as cli_main

__all__ = [
    "MemoryBankChunker",
    "LocalEmbedder", 
    "HybridSearcher",
    "cli_main"
]