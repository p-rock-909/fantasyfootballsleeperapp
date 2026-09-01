#!/usr/bin/env python3
"""
Minimal test script to verify core functionality without dependency issues.
Tests the claims systematically.
"""

import sys
import os
from pathlib import Path
import hashlib

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

def test_config_loading():
    """Test 1: Config loading"""
    print("🧪 Testing config loading...")
    try:
        import yaml
        config_path = Path(__file__).parent / "config.yml"
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        print(f"✅ Config loaded successfully")
        print(f"   - Model: {config['model']['name']}")
        print(f"   - Memory bank root: {config['storage']['memory_bank_root']}")
        print(f"   - Index path: {config['storage']['index_path']}")
        return config
    except Exception as e:
        print(f"❌ Config loading failed: {e}")
        return None

def test_memory_bank_exists(config):
    """Test 2: Memory bank directory exists"""
    print("\n🧪 Testing memory bank directory...")
    try:
        memory_bank_path = Path(config['storage']['memory_bank_root'])
        if memory_bank_path.exists():
            print(f"✅ Memory bank directory exists: {memory_bank_path}")
            
            # Count markdown files
            md_files = list(memory_bank_path.rglob("*.md"))
            print(f"   - Found {len(md_files)} markdown files")
            
            # Show first few files for verification
            for i, file in enumerate(md_files[:5]):
                relative_path = file.relative_to(memory_bank_path)
                print(f"   - {relative_path}")
            
            return md_files
        else:
            print(f"❌ Memory bank directory not found: {memory_bank_path}")
            return []
    except Exception as e:
        print(f"❌ Memory bank test failed: {e}")
        return []

def test_file_categorization(md_files):
    """Test 3: File categorization by size"""
    print("\n🧪 Testing file categorization...")
    try:
        small_threshold = 400  # 🟢 Small files
        medium_threshold = 600  # 🟡 Medium files
        # Large files 🔴 are >600 lines
        
        categories = {'🟢': 0, '🟡': 0, '🔴': 0}
        
        for file_path in md_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    line_count = sum(1 for _ in f)
                
                if line_count < small_threshold:
                    categories['🟢'] += 1
                    category = '🟢'
                elif line_count < medium_threshold:
                    categories['🟡'] += 1
                    category = '🟡'
                else:
                    categories['🔴'] += 1
                    category = '🔴'
                    
                print(f"   {category} {file_path.name}: {line_count} lines")
                
            except Exception as e:
                print(f"   ⚠️ Could not read {file_path.name}: {e}")
        
        print(f"\n✅ File categorization complete:")
        print(f"   🟢 Small files (<{small_threshold} lines): {categories['🟢']}")
        print(f"   🟡 Medium files ({small_threshold}-{medium_threshold} lines): {categories['🟡']}")
        print(f"   🔴 Large files (>{medium_threshold} lines): {categories['🔴']}")
        
        return categories
        
    except Exception as e:
        print(f"❌ File categorization failed: {e}")
        return {}

def test_change_detection(md_files):
    """Test 4: MD5 hash-based change detection"""
    print("\n🧪 Testing change detection (MD5 hashing)...")
    try:
        file_hashes = {}
        
        for file_path in md_files[:5]:  # Test first 5 files
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                    md5_hash = hashlib.md5(content).hexdigest()
                    file_hashes[str(file_path)] = md5_hash
                    print(f"   📄 {file_path.name}: {md5_hash[:8]}...")
                    
            except Exception as e:
                print(f"   ⚠️ Could not hash {file_path.name}: {e}")
        
        print(f"✅ Change detection hashing works: {len(file_hashes)} files hashed")
        
        # Simulate change detection
        print("\n   🔄 Simulating change detection:")
        for file_path, old_hash in list(file_hashes.items())[:2]:
            # Re-hash same file (should be identical)
            with open(file_path, 'rb') as f:
                new_hash = hashlib.md5(f.read()).hexdigest()
            
            if old_hash == new_hash:
                print(f"   ✅ {Path(file_path).name}: No change detected")
            else:
                print(f"   🔄 {Path(file_path).name}: Change detected")
                
        return file_hashes
        
    except Exception as e:
        print(f"❌ Change detection failed: {e}")
        return {}

def test_domain_configuration(config):
    """Test 5: Domain configuration"""
    print("\n🧪 Testing domain configuration...")
    try:
        domains = config.get('domains', {})
        
        expected_domains = ['business', 'automation', 'health', 'philosophy']
        
        for domain in expected_domains:
            if domain in domains:
                domain_config = domains[domain]
                boost = domain_config.get('boost', 1.0)
                files = domain_config.get('files', [])
                keywords = domain_config.get('keywords', [])
                
                print(f"   ✅ {domain.title()} domain:")
                print(f"      - Boost factor: {boost}")
                print(f"      - Files: {len(files)} entries")
                print(f"      - Keywords: {keywords[:3]}{'...' if len(keywords) > 3 else ''}")
            else:
                print(f"   ❌ {domain.title()} domain: Missing")
        
        print(f"✅ Domain configuration complete: {len(domains)} domains configured")
        return domains
        
    except Exception as e:
        print(f"❌ Domain configuration test failed: {e}")
        return {}

def test_directory_structure():
    """Test 6: Expected directory structure"""
    print("\n🧪 Testing directory structure...")
    try:
        base_path = Path(__file__).parent
        expected_dirs = [
            'core',
            'core/__pycache__' if (base_path / 'core' / '__pycache__').exists() else None,
            'utils',
            'evaluation'
        ]
        expected_files = [
            'config.yml',
            'requirements.txt',
            'core/__init__.py',
            'core/chunker.py',
            'core/embedder.py',
            'core/searcher.py',
            'core/indexer.py'
        ]
        
        print("   📁 Checking directories:")
        for dir_name in expected_dirs:
            if dir_name is None:
                continue
            dir_path = base_path / dir_name
            if dir_path.exists():
                print(f"   ✅ {dir_name}/")
            else:
                print(f"   ❌ {dir_name}/ - Missing")
        
        print("\n   📄 Checking files:")
        for file_name in expected_files:
            file_path = base_path / file_name
            if file_path.exists():
                size = file_path.stat().st_size
                print(f"   ✅ {file_name} ({size} bytes)")
            else:
                print(f"   ❌ {file_name} - Missing")
        
        return True
        
    except Exception as e:
        print(f"❌ Directory structure test failed: {e}")
        return False

def main():
    """Run all core tests"""
    print("🚀 MBIE Core Functionality Test Suite")
    print("=" * 50)
    
    # Test 1: Config loading
    config = test_config_loading()
    if not config:
        print("❌ Cannot continue without config")
        return False
    
    # Test 2: Memory bank exists
    md_files = test_memory_bank_exists(config)
    if not md_files:
        print("❌ Cannot continue without memory bank files")
        return False
    
    # Test 3: File categorization
    categories = test_file_categorization(md_files)
    
    # Test 4: Change detection
    file_hashes = test_change_detection(md_files)
    
    # Test 5: Domain configuration
    domains = test_domain_configuration(config)
    
    # Test 6: Directory structure
    structure_ok = test_directory_structure()
    
    print("\n" + "=" * 50)
    print("📊 SUMMARY:")
    print(f"   ✅ Config loading: {'PASS' if config else 'FAIL'}")
    print(f"   ✅ Memory bank access: {'PASS' if md_files else 'FAIL'}")
    print(f"   ✅ File categorization: {'PASS' if categories else 'FAIL'}")
    print(f"   ✅ Change detection: {'PASS' if file_hashes else 'FAIL'}")
    print(f"   ✅ Domain configuration: {'PASS' if domains else 'FAIL'}")
    print(f"   ✅ Directory structure: {'PASS' if structure_ok else 'FAIL'}")
    
    total_files = len(md_files)
    if categories:
        print(f"\n📈 STATISTICS:")
        print(f"   Total files: {total_files}")
        print(f"   🟢 Small: {categories.get('🟢', 0)}")
        print(f"   🟡 Medium: {categories.get('🟡', 0)}")
        print(f"   🔴 Large: {categories.get('🔴', 0)}")
    
    print("\n🎯 NEXT STEPS:")
    print("   1. Fix dependency issues to test full CLI")
    print("   2. Test ChromaDB persistence")
    print("   3. Verify search functionality")
    print("   4. Test incremental indexing with actual changes")

if __name__ == '__main__':
    main()