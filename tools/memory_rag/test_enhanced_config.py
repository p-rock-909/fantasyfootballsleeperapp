#!/usr/bin/env python3
"""
Test the enhanced MBIE configuration to verify additional sources are detected.
"""

import yaml
from pathlib import Path
import sys

def test_enhanced_config():
    """Test the enhanced MBIE configuration"""
    
    # Load config
    config_path = Path(__file__).parent / "config.yml"
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    print("=== Enhanced MBIE Configuration Test ===\n")
    
    # Test additional sources
    additional_sources = config['storage'].get('additional_sources', [])
    print(f"Additional sources configured: {len(additional_sources)}")
    for source in additional_sources:
        print(f"  - {source}")
    
    # Test source paths exist
    memory_bank_root = Path(config['storage']['memory_bank_root'])
    print(f"\nMemory bank root: {memory_bank_root}")
    print(f"Memory bank exists: {memory_bank_root.exists()}")
    
    print("\nAdditional source validation:")
    for source in additional_sources:
        # Convert relative paths to absolute paths
        if source.startswith('../'):
            # Calculate path relative to tools/memory_rag directory
            tools_memory_rag = Path(__file__).parent
            source_path = tools_memory_rag / source
            source_path = source_path.resolve()
        else:
            source_path = Path(source)
        
        exists = source_path.exists()
        md_files = list(source_path.rglob("*.md")) if exists else []
        
        print(f"  {source}:")
        print(f"    Path: {source_path}")
        print(f"    Exists: {exists}")
        print(f"    MD files: {len(md_files)}")
        if md_files:
            print(f"    Sample files: {[f.name for f in md_files[:3]]}")
    
    # Test new domains
    print(f"\nDomain configurations: {len(config['domains'])}")
    for domain_name, domain_config in config['domains'].items():
        boost = domain_config.get('boost', 1.0)
        keywords = domain_config.get('keywords', [])
        print(f"  {domain_name}: boost={boost}, keywords={len(keywords)}")
    
    # Test temporal context enhancements
    temporal = config['intelligence']['temporal_context']
    live_sources = temporal.get('live_data_sources', [])
    print(f"\nLive data sources: {len(live_sources)}")
    for source in live_sources:
        print(f"  - {source}")
    
    # Test keyword multipliers
    multipliers = config['intelligence']['priority_scoring']['keyword_multipliers']
    print(f"\nKeyword multipliers: {len(multipliers)}")
    for keyword, multiplier in multipliers.items():
        print(f"  '{keyword}': {multiplier}")
    
    print("\n=== Configuration Test Complete ===")

if __name__ == "__main__":
    test_enhanced_config()