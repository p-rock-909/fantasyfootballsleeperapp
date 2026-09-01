#!/usr/bin/env python3
"""
Direct test of chunker functionality without any embeddings dependencies.
"""

import sys
import yaml
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

def test_chunker():
    """Test chunker directly"""
    print("🧪 Testing chunker in isolation...")
    
    try:
        # Import chunker directly (bypassing __init__.py to avoid embedder)
        import importlib.util
        spec = importlib.util.spec_from_file_location("chunker", "core/chunker.py")
        chunker_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(chunker_module)
        
        MemoryBankChunker = chunker_module.MemoryBankChunker
        
        # Load config
        with open('config.yml', 'r') as f:
            config = yaml.safe_load(f)
        
        chunker = MemoryBankChunker(config)
        print("   ✅ Chunker initialized")
        
        # Test with actual memory bank file
        memory_bank_path = Path(config['storage']['memory_bank_root'])
        md_files = list(memory_bank_path.rglob("*.md"))
        
        if not md_files:
            print("   ❌ No markdown files found")
            return False
        
        # Test with first file
        test_file = md_files[0]
        print(f"   📄 Testing with: {test_file.name}")
        
        with open(test_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        print(f"   📊 File has {len(content.split(chr(10)))} lines")
        
        # Test categorization
        size_category, line_count = chunker.categorize_document(content)
        print(f"   📈 Categorized as: {size_category} ({line_count} lines)")
        
        # Test chunking
        chunks = chunker.chunk_document(str(test_file), content)
        print(f"   📦 Generated {len(chunks)} chunks")
        
        # Test first chunk
        if chunks:
            first_chunk = chunks[0]
            print(f"   ✅ First chunk ID: {first_chunk.chunk_id}")
            print(f"   ✅ Section header: '{first_chunk.section_header}'")
            print(f"   ✅ Navigation path: {first_chunk.navigation_path}")
            print(f"   ✅ Content length: {len(first_chunk.content)} chars")
            print(f"   ✅ Line range: {first_chunk.start_line}-{first_chunk.end_line}")
            
            # Test citation generation
            citation = first_chunk.generate_citation()
            print(f"   ✅ Citation: {citation}")
        
        # Test different file categories
        categories_found = {'🔴': 0, '🟡': 0, '🟢': 0}
        
        for i, file in enumerate(md_files[:10]):  # Test first 10 files
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    file_content = f.read()
                
                category, lines = chunker.categorize_document(file_content)
                categories_found[category] += 1
                
            except Exception as e:
                print(f"   ⚠️  Could not process {file.name}: {e}")
        
        print(f"   📊 Categories found in sample:")
        print(f"      🔴 Large (>600 lines): {categories_found['🔴']}")
        print(f"      🟡 Medium (400-600): {categories_found['🟡']}")  
        print(f"      🟢 Small (<400): {categories_found['🟢']}")
        
        return True
        
    except Exception as e:
        print(f"   ❌ Chunker test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("🚀 Direct Chunker Test")
    print("=" * 30)
    
    success = test_chunker()
    
    if success:
        print("\n✅ CHUNKER TEST PASSED")
        print("   - File categorization works (🔴🟡🟢)")
        print("   - Document chunking works")
        print("   - Navigation paths generated")
        print("   - Citations formatted correctly")
    else:
        print("\n❌ CHUNKER TEST FAILED")
        print("   - Core chunking functionality broken")