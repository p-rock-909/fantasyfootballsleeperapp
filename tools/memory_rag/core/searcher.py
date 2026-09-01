"""
Hybrid search implementation combining semantic and keyword search.

Implements domain-aware boosting and navigation pattern preservation with Phase 1
intelligence enhancements for temporal context and priority scoring.

@see memory-bank/features/mbie-intelligence/technical-design.md#enhanced-search-integration
@navigation Use startHere.md → "🧠 Memory-Bank Intelligence Engine (MBIE)" path for context
"""

import chromadb
from chromadb.config import Settings
from typing import List, Dict, Optional, Tuple
import numpy as np
from pathlib import Path
import logging
import re

from .chunker import Chunk
from .embedder import LocalEmbedder
from .intelligence import IntelligenceProcessor, IntelligenceMetadata


class SearchResult:
    """Represents a search result with metadata"""
    
    def __init__(self, chunk: Chunk, score: float, relevance_type: str, 
                 intelligence_metadata: Optional[IntelligenceMetadata] = None):
        self.chunk = chunk
        self.score = score
        self.relevance_type = relevance_type
        self.citation = chunk.generate_citation()
        self.intelligence_metadata = intelligence_metadata
        self.enhanced_score = score  # Will be updated by intelligence boosting
        
    def to_dict(self) -> dict:
        """Convert to dictionary for serialization"""
        return {
            'content': self.chunk.content,
            'citation': self.citation,
            'score': self.score,
            'relevance_type': self.relevance_type,
            'navigation_path': self.chunk.navigation_path,
            'metadata': self.chunk.metadata
        }


class HybridSearcher:
    """
    Implements hybrid search combining semantic and keyword matching.
    
    Features:
    - Semantic search via ChromaDB
    - Keyword search with regex patterns
    - Domain-specific boosting
    - Navigation-aware ranking
    """
    
    def __init__(self, config: dict, embedder: LocalEmbedder):
        self.config = config
        self.embedder = embedder
        self.logger = logging.getLogger(__name__)
        
        # Initialize ChromaDB
        self.chroma_client = self._init_chromadb()
        self.collection = None
        
        # Load domain mappings
        self.domains = config['domains']
        
        # Search parameters
        self.top_k = config['search']['top_k']
        self.relevance_threshold = config['search']['relevance_threshold']
        self.hybrid_alpha = config['search']['hybrid_alpha']
        
        # Initialize intelligence processor
        self.intelligence_processor = IntelligenceProcessor(config)
        self.intelligence_enabled = config.get('intelligence', {}).get('enabled', True)
        
    def _init_chromadb(self) -> chromadb.Client:
        """Initialize ChromaDB client with error handling"""
        persist_directory = Path(self.config['storage']['index_path'])
        persist_directory.mkdir(parents=True, exist_ok=True)
        
        try:
            # ChromaDB 1.0+ initialization pattern
            client = chromadb.PersistentClient(path=str(persist_directory))
            self.logger.info(f"ChromaDB initialized at {persist_directory}")
            return client
            
        except Exception as e:
            self.logger.error(f"Failed to initialize ChromaDB with PersistentClient: {e}")
            # Try fallback to legacy pattern
            try:
                from chromadb.config import Settings
                settings = Settings(
                    chroma_db_impl="duckdb+parquet",
                    persist_directory=str(persist_directory),
                    anonymized_telemetry=False
                )
                client = chromadb.Client(settings)
                self.logger.info("ChromaDB initialized with legacy settings")
                return client
            except Exception as fallback_error:
                self.logger.error(f"ChromaDB initialization failed completely: {fallback_error}")
                raise RuntimeError(f"Cannot initialize ChromaDB: {fallback_error}")
        
    def create_or_load_collection(self, collection_name: str = "memory_bank"):
        """Create or load a ChromaDB collection"""
        try:
            # Try to get existing collection
            self.collection = self.chroma_client.get_collection(collection_name)
            self.logger.info(f"Loaded existing collection: {collection_name}")
        except (ValueError, Exception) as e:
            # Create new collection if it doesn't exist or other issues
            self.logger.info(f"Collection not found, creating new: {e}")
            self.collection = self.chroma_client.create_collection(
                name=collection_name,
                metadata={"description": "Randy's memory-bank RAG index"}
            )
            self.logger.info(f"Created new collection: {collection_name}")
            
    def add_chunks(self, chunks: List[Chunk], embeddings: List[List[float]]):
        """Add chunks with their embeddings to the collection"""
        if not self.collection:
            raise ValueError("Collection not initialized. Call create_or_load_collection first.")
            
        # Prepare data for ChromaDB
        ids = [chunk.chunk_id for chunk in chunks]
        documents = [chunk.content for chunk in chunks]
        metadatas = []
        
        for chunk in chunks:
            metadata = {
                'document_path': chunk.document_path,
                'section_header': chunk.section_header,
                'navigation_path': chunk.navigation_path,
                'start_line': chunk.start_line,
                'end_line': chunk.end_line,
                'size_category': chunk.metadata.get('size_category', '🟢')
            }
            metadatas.append(metadata)
            
        # Process intelligence metadata for chunks
        if self.intelligence_enabled:
            for i, chunk in enumerate(chunks):
                try:
                    intelligence_metadata = self.intelligence_processor.process_chunk_intelligence(
                        chunk.content, chunk.document_path
                    )
                    # Store intelligence metadata in chunk metadata
                    metadatas[i]['intelligence_boost'] = intelligence_metadata.overall_boost
                    metadatas[i]['status_type'] = intelligence_metadata.status_info.status_type.value
                    metadatas[i]['current_relevance'] = intelligence_metadata.temporal_context.current_relevance
                    metadatas[i]['urgency_score'] = intelligence_metadata.temporal_context.urgency_score
                    metadatas[i]['priority_level'] = intelligence_metadata.priority_markers.business_hierarchy_level
                except Exception as e:
                    self.logger.warning(f"Failed to process intelligence for chunk {chunk.chunk_id}: {e}")
                    metadatas[i]['intelligence_boost'] = 1.0
        
        # Add to collection
        self.collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas
        )
        
        self.logger.info(f"Added {len(chunks)} chunks to collection")
        
    def search(self, query: str, domain: Optional[str] = None, 
              filters: Optional[Dict] = None,
              intelligence_filters: Optional[Dict] = None) -> List[SearchResult]:
        """
        Perform hybrid search combining semantic and keyword matching with intelligence boosting.
        
        Args:
            query: Search query
            domain: Optional domain filter (business, automation, health, philosophy)
            filters: Optional metadata filters
            intelligence_filters: Optional intelligence-based filters (status, priority, etc.)
            
        Returns:
            List of SearchResult objects ranked by enhanced relevance
        """
        if not self.collection:
            raise ValueError("Collection not initialized. Call create_or_load_collection first.")
            
        # Sanitize query input for security
        query = self._sanitize_query(query)
        
        # Get semantic search results
        semantic_results = self._semantic_search(query, domain, filters)
        
        # Get keyword search results
        keyword_results = self._keyword_search(query, domain)
        
        # Combine and rank results
        combined_results = self._combine_results(
            semantic_results, 
            keyword_results,
            self.hybrid_alpha
        )
        
        # Apply domain boosting if specified
        if domain:
            combined_results = self._apply_domain_boost(combined_results, domain)

        # Apply intelligence boosting
        if self.intelligence_enabled:
            combined_results = self._apply_intelligence_boost(combined_results, query, intelligence_filters)
        else:
            # If intelligence is not enabled, set enhanced_score to current score
            # (which may have been boosted by domain boosting)
            for result in combined_results:
                result.enhanced_score = result.score

        # Sort by enhanced score and apply threshold
        combined_results.sort(key=lambda x: x.enhanced_score, reverse=True)
        filtered_results = [
            r for r in combined_results 
            if r.enhanced_score >= self.relevance_threshold
        ]
        
        # Return top k results
        return filtered_results[:self.top_k]
        
    def _sanitize_query(self, query: str) -> str:
        """
        Sanitize search query to prevent potential security issues.
        
        Args:
            query: Raw search query
            
        Returns:
            Sanitized query string
        """
        if not query or not isinstance(query, str):
            return ""
            
        # Remove potential script injection patterns
        sanitized = re.sub(r'[<>"\']', '', query)
        
        # Limit length to prevent excessive resource usage
        max_length = 1000
        if len(sanitized) > max_length:
            self.logger.warning(f"Query truncated from {len(sanitized)} to {max_length} characters")
            sanitized = sanitized[:max_length]
            
        # Remove excessive whitespace
        sanitized = ' '.join(sanitized.split())
        
        return sanitized.strip()
        
    def _semantic_search(self, query: str, domain: Optional[str],
                        filters: Optional[Dict]) -> List[SearchResult]:
        """Perform semantic search using ChromaDB"""
        # Generate query embedding
        query_embedding = self.embedder.embed_query(query)
        
        # Build where clause for filtering
        where_clause = {}
        if domain and domain in self.domains:
            # Filter by domain files
            domain_files = self.domains[domain]['files']
            # ChromaDB requires $or to have at least 2 elements
            # Use simple equality for single file, $or for multiple files
            if len(domain_files) == 1:
                where_clause = {"document_path": {"$eq": domain_files[0]}}
            else:
                where_clause = {
                    "$or": [
                        {"document_path": {"$eq": f}} for f in domain_files
                    ]
                }
            
        if filters:
            where_clause.update(filters)
            
        # Query ChromaDB
        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=self.top_k * 2,  # Get more for merging
            where=where_clause if where_clause else None
        )
        
        # Convert to SearchResult objects
        search_results = []
        for i in range(len(results['ids'][0])):
            # Reconstruct chunk from results
            chunk = Chunk(
                chunk_id=results['ids'][0][i],
                document_path=results['metadatas'][0][i]['document_path'],
                section_header=results['metadatas'][0][i]['section_header'],
                content=results['documents'][0][i],
                navigation_path=results['metadatas'][0][i]['navigation_path'],
                start_line=results['metadatas'][0][i]['start_line'],
                end_line=results['metadatas'][0][i]['end_line'],
                metadata=results['metadatas'][0][i]
            )
            
            # Calculate similarity score (convert distance to similarity)
            score = 1.0 - results['distances'][0][i]
            
            search_results.append(SearchResult(
                chunk=chunk,
                score=score,
                relevance_type='semantic'
            ))
            
        return search_results
        
    def _keyword_search(self, query: str, domain: Optional[str]) -> List[SearchResult]:
        """
        Perform keyword search on documents.

        This is a simplified version - in production, you might want to use
        SQLite FTS5 or another full-text search engine.
        """
        if not self.collection:
            return []

        # Get all documents (limited for efficiency)
        all_results = self.collection.get(limit=1000)

        # Convert query to keywords
        keywords = query.lower().split()

        # Get domain files for filtering
        domain_files = None
        if domain and domain in self.domains:
            keywords.extend(self.domains[domain]['keywords'])
            domain_files = set(self.domains[domain]['files'])

        search_results = []

        for i in range(len(all_results['ids'])):
            content = all_results['documents'][i].lower()
            metadata = all_results['metadatas'][i]

            # Skip if domain filter is active and document doesn't match
            if domain_files and metadata['document_path'] not in domain_files:
                continue

            # Calculate keyword match score
            match_count = sum(1 for keyword in keywords if keyword in content)

            if match_count > 0:
                # Normalize score
                score = match_count / len(keywords)
                
                # Reconstruct chunk
                chunk = Chunk(
                    chunk_id=all_results['ids'][i],
                    document_path=metadata['document_path'],
                    section_header=metadata['section_header'],
                    content=all_results['documents'][i],
                    navigation_path=metadata['navigation_path'],
                    start_line=metadata['start_line'],
                    end_line=metadata['end_line'],
                    metadata=metadata
                )
                
                search_results.append(SearchResult(
                    chunk=chunk,
                    score=score,
                    relevance_type='keyword'
                ))
                
        return search_results
        
    def _combine_results(self, semantic_results: List[SearchResult],
                        keyword_results: List[SearchResult],
                        alpha: float) -> List[SearchResult]:
        """
        Combine semantic and keyword search results.
        
        Alpha controls the weight: 0 = keyword only, 1 = semantic only
        """
        # Create a map of chunk_id to results
        combined_map = {}
        
        # Add semantic results
        for result in semantic_results:
            chunk_id = result.chunk.chunk_id
            if chunk_id not in combined_map:
                combined_map[chunk_id] = result
                result.score = result.score * alpha
            else:
                # Combine scores if already exists
                combined_map[chunk_id].score += result.score * alpha
                
        # Add keyword results
        for result in keyword_results:
            chunk_id = result.chunk.chunk_id
            if chunk_id not in combined_map:
                combined_map[chunk_id] = result
                result.score = result.score * (1 - alpha)
                result.relevance_type = 'keyword'
            else:
                # Combine scores
                combined_map[chunk_id].score += result.score * (1 - alpha)
                combined_map[chunk_id].relevance_type = 'hybrid'
                
        return list(combined_map.values())
        
    def _apply_domain_boost(self, results: List[SearchResult], 
                           domain: str) -> List[SearchResult]:
        """Apply domain-specific boosting to results"""
        if domain not in self.domains:
            return results
            
        boost_factor = self.domains[domain]['boost']
        domain_files = self.domains[domain]['files']
        
        for result in results:
            # Check if result is from a domain-specific file
            for domain_file in domain_files:
                if domain_file in result.chunk.document_path:
                    result.score *= boost_factor
                    break
                    
        return results
        
    def delete_document(self, document_path: str):
        """Delete all chunks from a specific document"""
        if not self.collection:
            return
            
        # Get all chunks for this document
        results = self.collection.get(
            where={"document_path": {"$eq": document_path}}
        )
        
        if results['ids']:
            self.collection.delete(ids=results['ids'])
            self.logger.info(f"Deleted {len(results['ids'])} chunks from {document_path}")
            
    def get_statistics(self) -> Dict:
        """Get statistics about the index"""
        if not self.collection:
            return {}
            
        count = self.collection.count()
        
        # Get unique documents
        all_results = self.collection.get(limit=count)
        unique_docs = set()
        category_counts = {'🔴': 0, '🟡': 0, '🟢': 0}
        
        for metadata in all_results['metadatas']:
            unique_docs.add(metadata['document_path'])
            category = metadata.get('size_category', '🟢')
            category_counts[category] += 1
            
        return {
            'total_chunks': count,
            'unique_documents': len(unique_docs),
            'category_distribution': category_counts,
            'embedding_dimension': self.embedder.get_embedding_dimension()
        }
    
    def _apply_intelligence_boost(self, results: List[SearchResult], 
                                query: str, 
                                intelligence_filters: Optional[Dict] = None) -> List[SearchResult]:
        """Apply intelligence-based boosting to search results"""
        
        enhanced_results = []
        
        for result in results:
            try:
                # Get intelligence metadata from chunk metadata
                chunk_metadata = result.chunk.metadata
                intelligence_boost = chunk_metadata.get('intelligence_boost', 1.0)
                status_type = chunk_metadata.get('status_type', 'unknown')
                current_relevance = chunk_metadata.get('current_relevance', 0.5)
                urgency_score = chunk_metadata.get('urgency_score', 0.0)
                priority_level = chunk_metadata.get('priority_level', 3)
                
                # Calculate enhanced score
                enhanced_score = result.score * intelligence_boost
                
                # Apply query-specific intelligence boosting
                enhanced_score = self._apply_query_specific_boost(
                    enhanced_score, query, status_type, current_relevance, urgency_score
                )
                
                # Apply intelligence filters if specified
                if intelligence_filters:
                    if not self._passes_intelligence_filters(
                        chunk_metadata, intelligence_filters
                    ):
                        continue  # Skip this result
                
                # Update result with enhanced score
                result.enhanced_score = enhanced_score
                enhanced_results.append(result)
                
            except Exception as e:
                self.logger.warning(f"Failed to apply intelligence boost to result: {e}")
                result.enhanced_score = result.score
                enhanced_results.append(result)
        
        return enhanced_results
    
    def _apply_query_specific_boost(self, base_score: float, query: str, 
                                  status_type: str, current_relevance: float, 
                                  urgency_score: float) -> float:
        """Apply query-specific intelligence boosting"""
        
        query_lower = query.lower()
        boost = base_score
        
        # Query type analysis
        if any(term in query_lower for term in ['current', 'active', 'now', 'today']):
            # Boost current/active content for current-focused queries
            if status_type == 'in_progress':
                boost *= 1.5
            boost *= (1.0 + current_relevance * 0.5)
        
        if any(term in query_lower for term in ['urgent', 'priority', 'critical', 'deadline']):
            # Boost urgent content for priority-focused queries
            boost *= (1.0 + urgency_score * 0.7)
        
        if any(term in query_lower for term in ['andrew', 'client', 'engagement', 'sprint']):
            # Boost client-related content for client queries
            boost *= 1.3
        
        if any(term in query_lower for term in ['completed', 'done', 'finished']):
            # Boost completed content for completion-focused queries
            if status_type == 'completed':
                boost *= 1.4
        
        return boost
    
    def _passes_intelligence_filters(self, chunk_metadata: Dict, 
                                   intelligence_filters: Dict) -> bool:
        """Check if chunk passes intelligence-based filters"""
        
        # Status filter
        if 'status_type' in intelligence_filters:
            required_status = intelligence_filters['status_type']
            chunk_status = chunk_metadata.get('status_type', 'unknown')
            if chunk_status != required_status:
                return False
        
        # Priority level filter
        if 'max_priority_level' in intelligence_filters:
            max_level = intelligence_filters['max_priority_level']
            chunk_level = chunk_metadata.get('priority_level', 3)
            if chunk_level > max_level:
                return False
        
        # Urgency threshold filter
        if 'min_urgency_score' in intelligence_filters:
            min_urgency = intelligence_filters['min_urgency_score']
            chunk_urgency = chunk_metadata.get('urgency_score', 0.0)
            if chunk_urgency < min_urgency:
                return False
        
        # Current relevance filter
        if 'min_current_relevance' in intelligence_filters:
            min_relevance = intelligence_filters['min_current_relevance']
            chunk_relevance = chunk_metadata.get('current_relevance', 0.5)
            if chunk_relevance < min_relevance:
                return False
        
        return True