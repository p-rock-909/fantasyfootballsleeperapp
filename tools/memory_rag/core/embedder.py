"""
Local embedding generation with sentence-transformers.

Ensures deterministic, reproducible embeddings for the memory-bank.
"""

import torch
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Optional
import logging
from pathlib import Path
import pickle
import hashlib

from .chunker import Chunk


class LocalEmbedder:
    """
    Generates embeddings locally using sentence-transformers.
    
    Features:
    - Deterministic output with fixed seeds
    - Batch processing for efficiency
    - Caching for unchanged content
    - CPU/GPU support
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        self.model_name = config['model']['name']
        self.device = config['model']['device']
        self.batch_size = config['model']['batch_size']
        
        # Set seeds for deterministic output
        if config['deterministic']['enable']:
            self._set_deterministic_mode(config['deterministic'])
            
        # Initialize model
        self.model = self._load_model()
        
        # Setup cache
        self.cache_dir = Path(config['storage']['cache_path'])
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.embedding_cache = self._load_cache()
        
    def _set_deterministic_mode(self, deterministic_config: dict):
        """Ensure deterministic embeddings"""
        import random
        
        random.seed(deterministic_config['random_seed'])
        np.random.seed(deterministic_config['numpy_seed'])
        torch.manual_seed(deterministic_config['torch_seed'])
        
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(deterministic_config['torch_seed'])
            torch.backends.cudnn.deterministic = True
            torch.backends.cudnn.benchmark = False
            
    def _load_model(self) -> SentenceTransformer:
        """Load the sentence transformer model"""
        self.logger.info(f"Loading model: {self.model_name}")
        
        model = SentenceTransformer(
            self.model_name,
            device=self.device
        )
        
        # Set model to eval mode for deterministic output
        model.eval()
        
        return model
        
    def _load_cache(self) -> dict:
        """Load embedding cache from disk"""
        cache_file = self.cache_dir / "embedding_cache.pkl"
        
        if cache_file.exists():
            try:
                with open(cache_file, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                self.logger.warning(f"Failed to load cache: {e}")
                return {}
        else:
            return {}
            
    def _save_cache(self):
        """Save embedding cache to disk"""
        cache_file = self.cache_dir / "embedding_cache.pkl"
        
        try:
            with open(cache_file, 'wb') as f:
                pickle.dump(self.embedding_cache, f)
        except Exception as e:
            self.logger.error(f"Failed to save cache: {e}")
            
    def _get_content_hash(self, content: str) -> str:
        """Generate hash for content to check cache"""
        return hashlib.md5(content.encode(), usedforsecurity=False).hexdigest()
        
    def embed_chunks(self, chunks: List[Chunk]) -> List[List[float]]:
        """
        Generate embeddings for a list of chunks.
        
        Uses caching to avoid re-computing embeddings for unchanged content.
        """
        embeddings = []
        chunks_to_embed = []
        chunk_indices = []
        
        # Check cache for existing embeddings
        for i, chunk in enumerate(chunks):
            content_hash = self._get_content_hash(chunk.content)
            
            if content_hash in self.embedding_cache:
                # Use cached embedding
                embeddings.append(self.embedding_cache[content_hash])
                self.logger.debug(f"Using cached embedding for chunk {chunk.chunk_id}")
            else:
                # Need to generate embedding
                chunks_to_embed.append(chunk)
                chunk_indices.append(i)
                embeddings.append(None)  # Placeholder
                
        # Generate new embeddings if needed
        if chunks_to_embed:
            self.logger.info(f"Generating embeddings for {len(chunks_to_embed)} chunks")
            
            # Extract text for embedding
            texts = [chunk.content for chunk in chunks_to_embed]
            
            # Generate embeddings in batches
            new_embeddings = self._batch_encode(texts)
            
            # Update cache and results
            for chunk, embedding, idx in zip(chunks_to_embed, new_embeddings, chunk_indices):
                content_hash = self._get_content_hash(chunk.content)
                self.embedding_cache[content_hash] = embedding
                embeddings[idx] = embedding
                
            # Save updated cache
            self._save_cache()
            
        return embeddings
        
    def _batch_encode(self, texts: List[str]) -> List[List[float]]:
        """Encode texts in batches for efficiency"""
        all_embeddings = []
        
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i:i + self.batch_size]
            
            # Generate embeddings with no_grad for efficiency
            with torch.no_grad():
                batch_embeddings = self.model.encode(
                    batch,
                    convert_to_numpy=True,
                    show_progress_bar=False,
                    batch_size=self.batch_size
                )
                
            # Convert to list for JSON serialization
            for embedding in batch_embeddings:
                all_embeddings.append(embedding.tolist())
                
        return all_embeddings
        
    def embed_query(self, query: str) -> List[float]:
        """
        Generate embedding for a single query.
        
        Queries are not cached as they are typically unique.
        """
        with torch.no_grad():
            embedding = self.model.encode(
                query,
                convert_to_numpy=True,
                show_progress_bar=False
            )
            
        return embedding.tolist()
        
    def get_embedding_dimension(self) -> int:
        """Get the dimension of the embeddings"""
        return self.model.get_sentence_embedding_dimension()
        
    def clear_cache(self):
        """Clear the embedding cache"""
        self.embedding_cache = {}
        self._save_cache()
        self.logger.info("Embedding cache cleared")