"""Unit tests for Memory-Bank aware chunking"""

import pytest
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent.parent.parent))

from core.chunker import MemoryBankChunker, Document, Chunk


@pytest.fixture
def chunker():
    """Create a chunker with test configuration"""
    config = {
        'chunking': {
            'small_file_lines': 400,
            'medium_file_lines': 600,
            'chunk_size': 512,
            'chunk_overlap': 50,
            'section_regex': '^##\\s+',
            'use_token_based': False,  # Disable for most tests to avoid tokenizer dependency
            'max_tokens_per_chunk': 512,
            'executive_summary_lines': 100,
            'section_preview_lines': 5
        },
        'model': {
            'name': 'sentence-transformers/all-MiniLM-L6-v2'
        }
    }
    return MemoryBankChunker(config)

@pytest.fixture 
def token_chunker():
    """Create a chunker with token-based configuration"""
    config = {
        'chunking': {
            'small_file_lines': 400,
            'medium_file_lines': 600,
            'chunk_size': 512,
            'chunk_overlap': 50,
            'section_regex': '^##\\s+',
            'use_token_based': True,
            'max_tokens_per_chunk': 512,
            'executive_summary_lines': 100,
            'section_preview_lines': 5
        },
        'model': {
            'name': 'sentence-transformers/all-MiniLM-L6-v2'
        }
    }
    return MemoryBankChunker(config)


def test_file_categorization(chunker):
    """Test 🔴🟡🟢 categorization logic"""
    # Small file (< 400 lines)
    small_content = '\n'.join(['line'] * 300)
    category, count = chunker.categorize_document(small_content)
    assert category == '🟢'
    assert count == 300
    
    # Medium file (400-600 lines)
    medium_content = '\n'.join(['line'] * 500)
    category, count = chunker.categorize_document(medium_content)
    assert category == '🟡'
    assert count == 500
    
    # Large file (> 600 lines)
    large_content = '\n'.join(['line'] * 700)
    category, count = chunker.categorize_document(large_content)
    assert category == '🔴'
    assert count == 700


def test_section_extraction(chunker):
    """Test ## header extraction"""
    content = """# Title
## Section 1
Content for section 1
More content

## Section 2
Content for section 2

### Subsection
Not a main section
"""
    sections = chunker._extract_sections(content)
    assert len(sections) == 2
    assert sections[0]['header'] == '## Section 1'
    assert sections[1]['header'] == '## Section 2'
    assert 'Content for section 1' in sections[0]['content']


def test_large_file_chunking(chunker):
    """Test 🔴 file executive summary extraction"""
    # Create large file content
    exec_summary = "This is the executive summary\nImportant overview content"
    sections = "\n## Section 1\nContent 1\n## Section 2\nContent 2"
    large_content = exec_summary + "\n" + '\n'.join(['filler'] * 700) + sections
    
    chunks = chunker.chunk_document("test.md", large_content)
    
    # Should have executive summary
    assert any(c.section_header == "Executive Summary" for c in chunks)
    
    # Executive summary should be limited in size
    exec_chunk = next(c for c in chunks if c.section_header == "Executive Summary")
    assert len(exec_chunk.content.split('\n')) <= 100


def test_medium_file_chunking(chunker):
    """Test 🟡 file section preservation"""
    content = "# Title\n" + '\n'.join(['line'] * 100)
    content += "\n## Section A\n" + '\n'.join(['content A'] * 200)
    content += "\n## Section B\n" + '\n'.join(['content B'] * 200)
    
    chunks = chunker.chunk_document("medium.md", content)
    
    # Should have chunks for each section
    section_headers = [c.section_header for c in chunks]
    assert any('Section A' in h for h in section_headers)
    assert any('Section B' in h for h in section_headers)


def test_small_file_chunking(chunker):
    """Test 🟢 file complete content preservation"""
    content = """# Small File
## Section 1
Complete content preserved
## Section 2
All content included"""
    
    chunks = chunker.chunk_document("small.md", content)
    
    # All sections should be present
    assert len(chunks) >= 2
    combined_content = ' '.join(c.content for c in chunks)
    assert 'Complete content preserved' in combined_content
    assert 'All content included' in combined_content


def test_chunk_metadata(chunker):
    """Test chunk metadata generation"""
    content = "## Test Section\nTest content"
    chunks = chunker.chunk_document("test.md", content)
    
    assert len(chunks) > 0
    chunk = chunks[0]
    
    # Check metadata fields
    assert chunk.chunk_id is not None
    assert chunk.document_path == "test.md"
    assert chunk.navigation_path is not None
    assert 'size_category' in chunk.metadata
    assert chunk.metadata['file_path'] == "test.md"


def test_empty_file_handling(chunker):
    """Test handling of empty files"""
    chunks = chunker.chunk_document("empty.md", "")
    assert len(chunks) == 0


def test_no_sections_handling(chunker):
    """Test handling of files without ## sections"""
    content = "Just plain text\nNo sections here\nMore content"
    chunks = chunker.chunk_document("nosections.md", content)
    
    assert len(chunks) > 0
    # Should create generic chunks
    assert any('Content Part' in c.section_header for c in chunks)


def test_citation_generation(chunker):
    """Test citation format generation"""
    content = "## Test Section\nContent"
    chunks = chunker.chunk_document("test.md", content)
    
    chunk = chunks[0]
    citation = chunk.generate_citation()
    
    assert 'test.md#' in citation
    assert citation.endswith('test-section')


def test_navigation_path_building(chunker):
    """Test navigation path construction"""
    content = "## Business Strategy\nContent"
    chunks = chunker.chunk_document("business.md", content)
    
    chunk = chunks[0]
    assert 'business.md' in chunk.navigation_path
    assert 'Business Strategy' in chunk.navigation_path


def test_unicode_handling(chunker):
    """Test handling of unicode content"""
    content = "## Test 🔴🟡🟢\nContent with émojis and 中文\n## Another Section\nMore content"
    
    # Should not raise any exceptions
    chunks = chunker.chunk_document("unicode.md", content)
    assert len(chunks) > 0
    
    # Content should be preserved
    combined = ' '.join(c.content for c in chunks)
    assert '🔴🟡🟢' in combined
    assert '中文' in combined


def test_large_section_chunking(chunker):
    """Test chunking of very large sections"""
    # Create a section larger than chunk_size
    large_section = "## Large Section\n" + ' '.join(['word'] * 1000)
    
    chunks = chunker.chunk_document("large_section.md", large_section)
    
    # Should split into multiple parts
    large_chunks = [c for c in chunks if 'Large Section' in c.section_header]
    assert len(large_chunks) > 1
    
    # Parts should be numbered
    assert any('Part' in c.section_header for c in large_chunks)


def test_token_based_chunking_fallback(token_chunker):
    """Test token-based chunking fallback behavior (Issue #203)"""
    # Token chunker should initialize and fall back gracefully
    assert token_chunker.use_token_based in [True, False]  # Depends on tokenizer availability
    
    # Should still be able to chunk content regardless
    content = "This is test content for token-based chunking validation."
    chunks = token_chunker.chunk_document("test.md", content)
    assert len(chunks) > 0
    assert chunks[0].content


def test_configurable_limits(chunker):
    """Test configurable magic numbers (Issue #203 code review)"""
    # Test that configurable values are used
    assert chunker.executive_summary_lines == 100
    assert chunker.section_preview_lines == 5
    
    # Test with custom configuration
    config = {
        'chunking': {
            'small_file_lines': 400,
            'medium_file_lines': 600,
            'chunk_size': 512,
            'chunk_overlap': 50,
            'section_regex': '^##\\s+',
            'use_token_based': False,
            'max_tokens_per_chunk': 512,
            'executive_summary_lines': 50,  # Custom value
            'section_preview_lines': 3      # Custom value
        },
        'model': {
            'name': 'sentence-transformers/all-MiniLM-L6-v2'
        }
    }
    custom_chunker = MemoryBankChunker(config)
    assert custom_chunker.executive_summary_lines == 50
    assert custom_chunker.section_preview_lines == 3


def test_configuration_bounds_checking():
    """Test configuration parameter bounds checking (Claude Code review suggestion)"""
    # Test extreme values are bounded
    config = {
        'chunking': {
            'small_file_lines': 400,
            'medium_file_lines': 600,
            'chunk_size': 512,
            'chunk_overlap': 50,
            'section_regex': '^##\\s+',
            'use_token_based': False,
            'max_tokens_per_chunk': 512,
            'executive_summary_lines': 5000,  # Too large, should be bounded to 1000
            'section_preview_lines': 100     # Too large, should be bounded to 50
        },
        'model': {
            'name': 'sentence-transformers/all-MiniLM-L6-v2'
        }
    }
    chunker = MemoryBankChunker(config)
    assert chunker.executive_summary_lines == 1000  # Bounded to maximum
    assert chunker.section_preview_lines == 50      # Bounded to maximum
    
    # Test minimum bounds
    config['chunking']['executive_summary_lines'] = 5   # Too small, should be bounded to 10
    config['chunking']['section_preview_lines'] = 0    # Too small, should be bounded to 1
    chunker = MemoryBankChunker(config)
    assert chunker.executive_summary_lines == 10  # Bounded to minimum
    assert chunker.section_preview_lines == 1     # Bounded to minimum


def test_enhanced_header_detection(chunker):
    """Test ### header detection (Issue #203)"""
    # Create config with enhanced regex
    config = {
        'chunking': {
            'small_file_lines': 400,
            'medium_file_lines': 600,
            'chunk_size': 512,
            'chunk_overlap': 50,
            'section_regex': '^###?\\s+',  # Enhanced to include ### headers
            'use_token_based': False,
            'max_tokens_per_chunk': 512,
            'executive_summary_lines': 100,
            'section_preview_lines': 5
        },
        'model': {
            'name': 'sentence-transformers/all-MiniLM-L6-v2'
        }
    }
    enhanced_chunker = MemoryBankChunker(config)
    
    content = """# Title
## Section 1
Content for section 1

### Subsection 1.1
Subsection content

## Section 2
Content for section 2
"""
    sections = enhanced_chunker._extract_sections(content)
    # Should detect both ## and ### headers
    headers = [s['header'] for s in sections]
    assert '## Section 1' in headers
    assert '### Subsection 1.1' in headers
    assert '## Section 2' in headers


def test_logging_instead_of_print(caplog):
    """Test that proper logging is used instead of print statements (Issue #203 code review)"""
    import logging
    caplog.set_level(logging.INFO)

    # Create chunker inside test to capture initialization logging
    config = {
        'chunking': {
            'small_file_lines': 400,
            'medium_file_lines': 600,
            'chunk_size': 512,
            'chunk_overlap': 50,
            'section_regex': '^##\\s+',
            'use_token_based': True,
            'max_tokens_per_chunk': 512,
            'executive_summary_lines': 100,
            'section_preview_lines': 5
        },
        'model': {
            'name': 'sentence-transformers/all-MiniLM-L6-v2'
        }
    }
    from core.chunker import MemoryBankChunker
    token_chunker = MemoryBankChunker(config)

    # Trigger tokenizer initialization logging
    # The logging should appear in caplog instead of stdout
    if token_chunker.tokenizer:
        assert "Token-based chunking enabled" in caplog.text
    else:
        assert "Tokenizer not available" in caplog.text or "Failed to load tokenizer" in caplog.text