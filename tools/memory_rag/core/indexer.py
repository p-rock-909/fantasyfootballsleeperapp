"""
Incremental indexing implementation for efficient updates.

Tracks file changes and only re-indexes modified documents.
"""

import os
import hashlib
import json
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Set, Optional
import logging
from tqdm import tqdm

from .chunker import MemoryBankChunker
from .embedder import LocalEmbedder
from .searcher import HybridSearcher


class IncrementalIndexer:
    """
    Handles incremental indexing of memory-bank documents.
    
    Features:
    - Tracks file modifications via content hashes
    - Only re-indexes changed files
    - Maintains index state for efficient updates
    - Supports full reindex when needed
    """
    
    def __init__(self, config: dict, chunker: MemoryBankChunker,
                 embedder: LocalEmbedder, searcher: HybridSearcher):
        self.config = config
        self.chunker = chunker
        self.embedder = embedder
        self.searcher = searcher
        
        self.memory_bank_root = Path(config['storage']['memory_bank_root'])
        self.index_state_file = Path(config['storage']['index_path']) / "index_state.json"
        
        self.logger = logging.getLogger(__name__)
        
    def _get_file_hash(self, file_path: Path) -> str:
        """Generate hash of file content"""
        with open(file_path, 'rb') as f:
            return hashlib.md5(f.read(), usedforsecurity=False).hexdigest()
            
    def _get_file_mtime(self, file_path: Path) -> float:
        """Get file modification time"""
        return os.path.getmtime(file_path)
        
    def _load_index_state(self) -> Dict:
        """Load the current index state from disk"""
        if self.index_state_file.exists():
            try:
                with open(self.index_state_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                self.logger.warning(f"Failed to load index state: {e}")
                return {}
        return {}
        
    def _save_index_state(self, state: Dict):
        """Save the index state to disk"""
        self.index_state_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(self.index_state_file, 'w') as f:
            json.dump(state, f, indent=2)
            
    def _scan_memory_bank(self) -> Dict[str, Dict]:
        """
        Scan memory-bank for all markdown files.
        
        Returns:
            Dictionary mapping file paths to their metadata
        """
        files = {}
        
        # Define paths to scan - memory-bank first
        scan_paths = [
            self.memory_bank_root,
            self.memory_bank_root / "features",
            self.memory_bank_root / "guides"
        ]
        
        # Add additional sources from config
        additional_sources = self.config['storage'].get('additional_sources', [])
        for source in additional_sources:
            # Convert relative paths to absolute paths
            if source.startswith('../'):
                # Calculate path relative to tools/memory_rag directory
                tools_memory_rag = Path(__file__).parent.parent
                source_path = tools_memory_rag / source
                source_path = source_path.resolve()
            else:
                source_path = Path(source)
            
            if source_path.exists():
                scan_paths.append(source_path)
                self.logger.info(f"Added additional source for indexing: {source_path}")
            else:
                self.logger.warning(f"Additional source does not exist: {source_path}")
        
        # Patterns to exclude
        exclude_patterns = [
            ".rag",
            "__pycache__",
            ".git",
            "node_modules"
        ]
        
        for scan_path in scan_paths:
            if not scan_path.exists():
                continue
                
            for file_path in scan_path.rglob("*.md"):
                # Skip excluded paths
                if any(pattern in str(file_path) for pattern in exclude_patterns):
                    continue
                    
                # Get relative path - handle files outside memory_bank_root
                try:
                    relative_path = file_path.relative_to(self.memory_bank_root)
                except ValueError:
                    # File is outside memory_bank_root, use a different base
                    relative_path = Path("external") / scan_path.name / file_path.relative_to(scan_path)
                
                files[str(relative_path)] = {
                    'absolute_path': str(file_path),
                    'hash': self._get_file_hash(file_path),
                    'mtime': self._get_file_mtime(file_path),
                    'size': file_path.stat().st_size
                }
                
        return files
        
    def detect_changes(self) -> tuple[List[str], List[str], List[str]]:
        """
        Detect changed files since last index.
        
        Returns:
            Tuple of (new_files, modified_files, deleted_files)
        """
        current_state = self._scan_memory_bank()
        previous_state = self._load_index_state()
        
        current_files = set(current_state.keys())
        previous_files = set(previous_state.keys())
        
        # Detect new files
        new_files = list(current_files - previous_files)
        
        # Detect deleted files
        deleted_files = list(previous_files - current_files)
        
        # Detect modified files
        modified_files = []
        for file_path in current_files & previous_files:
            if current_state[file_path]['hash'] != previous_state[file_path]['hash']:
                modified_files.append(file_path)
                
        return new_files, modified_files, deleted_files
        
    def incremental_index(self) -> int:
        """
        Perform incremental indexing of changed files.
        
        Returns:
            Number of files indexed
        """
        # Detect changes
        new_files, modified_files, deleted_files = self.detect_changes()
        
        total_changes = len(new_files) + len(modified_files) + len(deleted_files)
        
        if total_changes == 0:
            self.logger.info("No changes detected")
            return 0
            
        self.logger.info(f"Detected {len(new_files)} new, {len(modified_files)} modified, "
                        f"{len(deleted_files)} deleted files")
        
        # Handle deleted files
        for file_path in deleted_files:
            self.logger.info(f"Removing chunks for deleted file: {file_path}")
            self.searcher.delete_document(file_path)
            
        # Handle modified files (delete old chunks, will re-add below)
        for file_path in modified_files:
            self.logger.info(f"Removing old chunks for modified file: {file_path}")
            self.searcher.delete_document(file_path)
            
        # Index new and modified files
        files_to_index = new_files + modified_files
        indexed_count = 0
        
        current_state = self._scan_memory_bank()
        
        with tqdm(total=len(files_to_index), desc="Indexing files") as pbar:
            for file_path in files_to_index:
                try:
                    # Load file content
                    absolute_path = Path(current_state[file_path]['absolute_path'])
                    
                    # Enhanced error handling for file operations
                    try:
                        with open(absolute_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                    except FileNotFoundError:
                        self.logger.error(f"File not found: {file_path}")
                        continue
                    except UnicodeDecodeError:
                        self.logger.error(f"Unicode decode error in file: {file_path}")
                        # Try with alternative encoding
                        try:
                            with open(absolute_path, 'r', encoding='latin-1') as f:
                                content = f.read()
                        except Exception as e:
                            self.logger.error(f"Failed to read {file_path} with fallback encoding: {e}")
                            continue
                    except PermissionError:
                        self.logger.error(f"Permission denied: {file_path}")
                        continue
                        
                    # Validate markdown content
                    if not content.strip():
                        self.logger.warning(f"Empty file skipped: {file_path}")
                        continue
                        
                    # Chunk the document
                    chunks = self.chunker.chunk_document(file_path, content)
                    
                    if chunks:
                        # Generate embeddings
                        embeddings = self.embedder.embed_chunks(chunks)
                        
                        # Add to search index
                        self.searcher.add_chunks(chunks, embeddings)
                        
                        indexed_count += 1
                        self.logger.debug(f"Indexed {len(chunks)} chunks from {file_path}")
                        
                except Exception as e:
                    self.logger.error(f"Failed to index {file_path}: {e}")
                    
                pbar.update(1)
                
        # Save new index state
        self._save_index_state(current_state)
        
        self.logger.info(f"Incremental indexing complete. Indexed {indexed_count} files")
        return indexed_count
        
    def full_index(self) -> int:
        """
        Perform full reindex of all files.
        
        Returns:
            Number of files indexed
        """
        self.logger.info("Starting full reindex")
        
        # Clear existing index
        # Note: This assumes recreating the collection clears it
        # You might need to implement a clear method in HybridSearcher
        
        # Scan all files
        current_state = self._scan_memory_bank()
        
        indexed_count = 0
        
        with tqdm(total=len(current_state), desc="Indexing files") as pbar:
            for file_path, metadata in current_state.items():
                try:
                    # Load file content
                    absolute_path = Path(metadata['absolute_path'])
                    
                    # Enhanced error handling for file operations
                    try:
                        with open(absolute_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                    except FileNotFoundError:
                        self.logger.error(f"File not found: {file_path}")
                        continue
                    except UnicodeDecodeError:
                        self.logger.error(f"Unicode decode error in file: {file_path}")
                        # Try with alternative encoding
                        try:
                            with open(absolute_path, 'r', encoding='latin-1') as f:
                                content = f.read()
                        except Exception as e:
                            self.logger.error(f"Failed to read {file_path} with fallback encoding: {e}")
                            continue
                    except PermissionError:
                        self.logger.error(f"Permission denied: {file_path}")
                        continue
                        
                    # Validate markdown content
                    if not content.strip():
                        self.logger.warning(f"Empty file skipped: {file_path}")
                        continue
                        
                    # Chunk the document
                    chunks = self.chunker.chunk_document(file_path, content)
                    
                    if chunks:
                        # Generate embeddings
                        embeddings = self.embedder.embed_chunks(chunks)
                        
                        # Add to search index
                        self.searcher.add_chunks(chunks, embeddings)
                        
                        indexed_count += 1
                        self.logger.debug(f"Indexed {len(chunks)} chunks from {file_path}")
                        
                except Exception as e:
                    self.logger.error(f"Failed to index {file_path}: {e}")
                    
                pbar.update(1)
                
        # Save index state
        self._save_index_state(current_state)
        
        self.logger.info(f"Full indexing complete. Indexed {indexed_count} files")
        return indexed_count
        
    def verify_index(self) -> Dict:
        """
        Verify index integrity and consistency.
        
        Returns:
            Dictionary with verification results
        """
        results = {
            'valid': True,
            'issues': [],
            'statistics': {}
        }
        
        # Check index state file
        if not self.index_state_file.exists():
            results['issues'].append("Index state file missing")
            results['valid'] = False
            
        # Check ChromaDB collection
        stats = self.searcher.get_statistics()
        results['statistics'] = stats
        
        # Verify all indexed files still exist
        index_state = self._load_index_state()
        current_files = self._scan_memory_bank()
        
        for file_path in index_state.keys():
            if file_path not in current_files:
                results['issues'].append(f"Indexed file no longer exists: {file_path}")
                results['valid'] = False
                
        # Check for unindexed files
        for file_path in current_files.keys():
            if file_path not in index_state:
                results['issues'].append(f"File not indexed: {file_path}")
                
        return results