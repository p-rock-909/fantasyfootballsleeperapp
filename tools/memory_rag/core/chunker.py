"""
Memory-Bank aware chunking implementation.

Implements the 🔴🟡🟢 file categorization strategy for optimal AI processing.
Now uses token-based chunking for accurate token control (Issue #203).
"""

import re
import logging
from dataclasses import dataclass
from typing import List, Dict, Optional, Literal, Any, Tuple
from pathlib import Path
import hashlib

try:
    from transformers import AutoTokenizer
    TOKENIZER_AVAILABLE = True
except ImportError:
    TOKENIZER_AVAILABLE = False


@dataclass
class Document:
    """Represents a memory-bank document"""
    file_path: str
    content: str
    size_category: Literal['🔴', '🟡', '🟢']
    line_count: int
    metadata: Dict[str, Any]


@dataclass
class Chunk:
    """Represents a searchable chunk"""
    chunk_id: str
    document_path: str
    section_header: str
    content: str
    navigation_path: str
    start_line: int
    end_line: int
    metadata: Dict[str, Any]
    
    def generate_citation(self) -> str:
        """Generate a citation in the format: file.md#section-header"""
        section_slug = self.section_header.lower().replace(' ', '-').replace('#', '')
        return f"{self.document_path}#{section_slug}"


class MemoryBankChunker:
    """
    Implements memory-bank specific chunking logic.
    
    Rules:
    - 🔴 files (>600 lines): Executive summary + section headers only
    - 🟡 files (400-600 lines): Major sections with sub-section preservation  
    - 🟢 files (<400 lines): Full content with cross-references
    """
    
    def __init__(self, config: Dict):
        self.config = config
        self.chunk_size = config['chunking']['chunk_size']
        self.chunk_overlap = config['chunking']['chunk_overlap']
        self.section_regex = re.compile(config['chunking']['section_regex'], re.MULTILINE)
        self.small_threshold = config['chunking']['small_file_lines']
        self.medium_threshold = config['chunking']['medium_file_lines']
        
        # Token-based chunking configuration (Issue #203)
        self.use_token_based = config['chunking'].get('use_token_based', False)
        self.max_tokens_per_chunk = config['chunking'].get('max_tokens_per_chunk', 512)
        
        # Large file processing limits (configurable magic numbers with bounds checking)
        self.executive_summary_lines = max(10, min(config['chunking'].get('executive_summary_lines', 100), 1000))
        self.section_preview_lines = max(1, min(config['chunking'].get('section_preview_lines', 5), 50))
        
        # Initialize tokenizer if available and requested
        self.tokenizer = None
        self.logger = logging.getLogger(__name__)
        
        if self.use_token_based and TOKENIZER_AVAILABLE:
            try:
                # Use same tokenizer as the embedding model for consistency
                model_name = config['model']['name']
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.logger.info(f"✅ Token-based chunking enabled with {model_name} tokenizer")
            except Exception as e:
                self.logger.warning(f"⚠️ Tokenizer '{model_name}' failed to load, falling back to word-based chunking: {e}")
                self.use_token_based = False
        elif self.use_token_based and not TOKENIZER_AVAILABLE:
            self.logger.warning("⚠️ Tokenizer not available, falling back to word-based chunking")
            self.use_token_based = False
        
    def categorize_document(self, content: str) -> Tuple[Literal['🔴', '🟡', '🟢'], int]:
        """Categorize document by line count"""
        lines = content.split('\n')
        line_count = len(lines)
        
        if line_count > self.medium_threshold:
            return '🔴', line_count
        elif line_count > self.small_threshold:
            return '🟡', line_count
        else:
            return '🟢', line_count
            
    def chunk_document(self, file_path: str, content: str) -> List[Chunk]:
        """
        Chunk document based on size category and structure.
        """
        size_category, line_count = self.categorize_document(content)
        
        doc = Document(
            file_path=file_path,
            content=content,
            size_category=size_category,
            line_count=line_count,
            metadata={'file_path': file_path}
        )
        
        if size_category == '🔴':
            return self._chunk_large_file(doc)
        elif size_category == '🟡':
            return self._chunk_medium_file(doc)
        else:
            return self._chunk_small_file(doc)
            
    def _chunk_large_file(self, doc: Document) -> List[Chunk]:
        """
        For 🔴 files: Extract executive summary and section headers only.
        This preserves navigation while minimizing token usage.
        """
        chunks = []
        lines = doc.content.split('\n')
        
        # Extract executive summary (first N lines or until first ##)
        exec_summary_lines = []
        for i, line in enumerate(lines[:self.executive_summary_lines]):
            if line.startswith('## '):
                break
            exec_summary_lines.append(line)
            
        if exec_summary_lines:
            chunks.append(self._create_chunk(
                doc=doc,
                content='\n'.join(exec_summary_lines),
                section_header="Executive Summary",
                start_line=0,
                end_line=len(exec_summary_lines)
            ))
        
        # Extract section headers with first paragraph
        sections = self._extract_sections(doc.content)
        for section in sections:
            # For large files, only include section header + first N lines
            section_content = section['header'] + '\n'
            section_lines = section['content'].split('\n')[:self.section_preview_lines]
            section_content += '\n'.join(section_lines)
            
            chunks.append(self._create_chunk(
                doc=doc,
                content=section_content,
                section_header=section['header'],
                start_line=section['start_line'],
                end_line=section['start_line'] + 5
            ))
            
        return chunks
        
    def _chunk_medium_file(self, doc: Document) -> List[Chunk]:
        """
        For 🟡 files: Major sections with sub-section preservation.
        Balances detail with token efficiency.
        """
        chunks = []
        sections = self._extract_sections(doc.content)
        
        for section in sections:
            # For medium files, include full section content
            # but chunk if section is too large
            section_chunks = self._chunk_text(
                section['content'],
                max_chunk_size=self.chunk_size,
                overlap=self.chunk_overlap
            )
            
            for i, chunk_content in enumerate(section_chunks):
                chunk_header = section['header']
                if len(section_chunks) > 1:
                    chunk_header += f" (Part {i+1}/{len(section_chunks)})"
                    
                chunks.append(self._create_chunk(
                    doc=doc,
                    content=chunk_content,
                    section_header=chunk_header,
                    start_line=section['start_line'],
                    end_line=section['end_line']
                ))
                
        return chunks
        
    def _chunk_small_file(self, doc: Document) -> List[Chunk]:
        """
        For 🟢 files: Full content with cross-references.
        Small files can be processed entirely.
        """
        chunks = []
        
        # For small files, try to keep sections together
        sections = self._extract_sections(doc.content)
        
        if not sections:
            # No sections found, chunk the entire content
            text_chunks = self._chunk_text(
                doc.content,
                max_chunk_size=self.chunk_size,
                overlap=self.chunk_overlap
            )
            
            for i, chunk_content in enumerate(text_chunks):
                chunks.append(self._create_chunk(
                    doc=doc,
                    content=chunk_content,
                    section_header=f"Content Part {i+1}",
                    start_line=0,
                    end_line=doc.line_count
                ))
        else:
            # Process each section, chunking if section is too large
            for section in sections:
                section_chunks = self._chunk_text(
                    section['content'],
                    max_chunk_size=self.chunk_size,
                    overlap=self.chunk_overlap
                )

                for i, chunk_content in enumerate(section_chunks):
                    chunk_header = section['header']
                    if len(section_chunks) > 1:
                        chunk_header += f" (Part {i+1}/{len(section_chunks)})"

                    chunks.append(self._create_chunk(
                        doc=doc,
                        content=chunk_content,
                        section_header=chunk_header,
                        start_line=section['start_line'],
                        end_line=section['end_line']
                    ))
                
        return chunks
        
    def _extract_sections(self, content: str) -> List[Dict]:
        """Extract sections based on ## headers"""
        sections = []
        lines = content.split('\n')
        
        current_section = None
        current_content = []
        
        for i, line in enumerate(lines):
            if self.section_regex.match(line):
                # Save previous section if exists
                if current_section:
                    sections.append({
                        'header': current_section['header'],
                        'content': '\n'.join(current_content),
                        'start_line': current_section['start_line'],
                        'end_line': i - 1
                    })
                    
                # Start new section
                current_section = {
                    'header': line.strip(),
                    'start_line': i
                }
                current_content = [line]
            elif current_section:
                current_content.append(line)
                
        # Save last section
        if current_section:
            sections.append({
                'header': current_section['header'],
                'content': '\n'.join(current_content),
                'start_line': current_section['start_line'],
                'end_line': len(lines) - 1
            })
            
        return sections
        
    def _chunk_text(self, text: str, max_chunk_size: int, overlap: int) -> List[str]:
        """
        Chunk text into smaller pieces with overlap.
        Uses token-based chunking if tokenizer is available, otherwise falls back to word-based.
        """
        if self.use_token_based and self.tokenizer:
            return self._chunk_text_by_tokens(text, max_chunk_size, overlap)
        else:
            return self._chunk_text_by_words(text, max_chunk_size, overlap)
    
    def _chunk_text_by_tokens(self, text: str, max_chunk_size: int, overlap: int) -> List[str]:
        """Token-based chunking for precise token control"""
        # Handle empty text
        if not text or not text.strip():
            return []

        # Tokenize the entire text
        tokens = self.tokenizer.tokenize(text)
        
        if len(tokens) <= max_chunk_size:
            return [text]
        
        chunks = []
        start = 0
        
        while start < len(tokens):
            end = min(start + max_chunk_size, len(tokens))
            chunk_tokens = tokens[start:end]
            
            # Convert tokens back to text
            chunk_text = self.tokenizer.convert_tokens_to_string(chunk_tokens)
            chunks.append(chunk_text)
            
            # Move start with overlap
            start = end - overlap if end < len(tokens) else end
        
        return chunks
    
    def _chunk_text_by_words(self, text: str, max_chunk_size: int, overlap: int) -> List[str]:
        """Legacy word-based chunking (fallback)"""
        # Handle empty text
        if not text or not text.strip():
            return []

        words = text.split()
        chunks = []

        if len(words) <= max_chunk_size:
            return [text]
            
        start = 0
        while start < len(words):
            end = min(start + max_chunk_size, len(words))
            chunk_words = words[start:end]
            chunks.append(' '.join(chunk_words))
            
            # Move start with overlap
            start = end - overlap if end < len(words) else end
            
        return chunks
        
    def _create_chunk(self, doc: Document, content: str, section_header: str,
                     start_line: int, end_line: int) -> Chunk:
        """Create a chunk with metadata"""
        # Generate unique chunk ID
        chunk_id = hashlib.md5(
            f"{doc.file_path}:{section_header}:{start_line}".encode(),
            usedforsecurity=False
        ).hexdigest()[:12]
        
        # Build navigation path
        navigation_path = self._build_navigation_path(doc.file_path, section_header)
        
        return Chunk(
            chunk_id=chunk_id,
            document_path=doc.file_path,
            section_header=section_header,
            content=content,
            navigation_path=navigation_path,
            start_line=start_line,
            end_line=end_line,
            metadata={
                'size_category': doc.size_category,
                'line_count': doc.line_count,
                'file_path': doc.file_path
            }
        )
        
    def _build_navigation_path(self, file_path: str, section_header: str) -> str:
        """Build navigation path for chunk"""
        # This would ideally reference startHere.md navigation patterns
        # For now, simple path construction
        if section_header == "Executive Summary":
            return f"{file_path} → Executive Summary"
        else:
            return f"{file_path} → {section_header}"