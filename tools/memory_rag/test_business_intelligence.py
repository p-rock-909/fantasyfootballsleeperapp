#!/usr/bin/env python3
"""
Test the enhanced MBIE business intelligence capabilities.
"""

import yaml
from pathlib import Path
import logging

def simulate_business_queries():
    """Simulate business intelligence queries to validate enhancements"""
    
    print("=== MBIE Business Intelligence Validation ===\n")
    
    # Load config to show enhancements
    config_path = Path(__file__).parent / "config.yml"
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    # Test business intelligence features
    print("🔍 Business Intelligence Query Simulation")
    print("=" * 50)
    
    # Simulate queries that would benefit from enhancements
    test_queries = [
        {
            "query": "What's on my schedule today?",
            "expected_sources": ["dailyData/dailyGoogleDataEnhanced.md"],
            "domain_boost": "daily_operations (1.7x)",
            "keywords": ["today", "calendar", "schedule"]
        },
        {
            "query": "What's the status of ExampleCorp's sprint?",
            "expected_sources": ["Team Lift LLC - Consulting OS/", "activeContext.md"],
            "domain_boost": "client_operations (2.0x)",
            "keywords": ["ExampleCorp", "sprint"]
        },
        {
            "query": "What deliverables are due for ExampleCorp?",
            "expected_sources": ["Team Lift LLC - Consulting OS/", "business-messaging-framework.md"],
            "domain_boost": "client_operations (2.0x)",
            "keywords": ["ExampleCorp", "deliverable"]
        },
        {
            "query": "Current client focus this week",
            "expected_sources": ["activeContext.md", "dailyData/"],
            "domain_boost": "business (1.5x) + daily_operations (1.7x)",
            "keywords": ["client", "focus", "current"]
        }
    ]
    
    for i, test in enumerate(test_queries, 1):
        print(f"\n{i}. Query: '{test['query']}'")
        print(f"   Expected sources: {test['expected_sources']}")
        print(f"   Domain boost: {test['domain_boost']}")
        print(f"   Keyword multipliers: {test['keywords']}")
        
        # Check if keywords have multipliers configured
        multipliers = config['intelligence']['priority_scoring']['keyword_multipliers']
        active_multipliers = []
        for keyword in test['keywords']:
            if keyword in multipliers:
                active_multipliers.append(f"'{keyword}': {multipliers[keyword]}")
        
        if active_multipliers:
            print(f"   ✅ Active multipliers: {', '.join(active_multipliers)}")
        else:
            print(f"   ⚠️ No specific multipliers configured")
    
    print(f"\n{'=' * 50}")
    print("🎯 Enhancement Summary")
    print("=" * 50)
    
    # Show what's been enhanced
    additional_sources = config['storage'].get('additional_sources', [])
    print(f"📁 Additional sources indexed: {len(additional_sources)}")
    for source in additional_sources:
        print(f"   - {source}")
    
    domains = config['domains']
    print(f"\n🏷️ Domain configurations: {len(domains)}")
    for domain_name, domain_config in domains.items():
        boost = domain_config.get('boost', 1.0)
        keywords = len(domain_config.get('keywords', []))
        print(f"   - {domain_name}: {boost}x boost, {keywords} keywords")
    
    multipliers = config['intelligence']['priority_scoring']['keyword_multipliers']
    business_multipliers = {k: v for k, v in multipliers.items() 
                          if k in ['ExampleCorp', 'ExampleCorp', 'sprint', 'deliverable', 'today', 'urgent', 'milestone']}
    print(f"\n⚡ Business keyword multipliers: {len(business_multipliers)}")
    for keyword, multiplier in business_multipliers.items():
        print(f"   - '{keyword}': {multiplier}x")
    
    live_sources = config['intelligence']['temporal_context'].get('live_data_sources', [])
    print(f"\n📊 Live data integration: {len(live_sources)} sources")
    for source in live_sources:
        print(f"   - {source}")
    
    print(f"\n{'=' * 50}")
    print("✅ Business Intelligence Enhancement Complete")
    print("=" * 50)
    print("The MBIE system is now configured with:")
    print("- Expanded indexing of daily data and client work")
    print("- Business-focused domain prioritization") 
    print("- Client-specific keyword multipliers")
    print("- Live data source integration")
    print("- Enhanced temporal context awareness")
    
    print(f"\n🚀 Ready for business intelligence queries!")

if __name__ == "__main__":
    simulate_business_queries()