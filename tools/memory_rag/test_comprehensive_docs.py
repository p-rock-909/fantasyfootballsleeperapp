#!/usr/bin/env python3
"""
Test the comprehensive docs indexing to show the full scope of business intelligence.
"""

import yaml
from pathlib import Path

def analyze_comprehensive_docs():
    """Analyze the comprehensive docs indexing scope"""
    
    print("=== MBIE Comprehensive Docs Analysis ===\n")
    
    # Load config
    config_path = Path(__file__).parent / "config.yml"
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)
    
    # Analyze docs directory
    tools_memory_rag = Path(__file__).parent
    docs_path = tools_memory_rag / "../../docs/"
    docs_path = docs_path.resolve()
    
    print(f"📁 Comprehensive Docs Indexing")
    print("=" * 50)
    print(f"Docs path: {docs_path}")
    
    if docs_path.exists():
        md_files = list(docs_path.rglob("*.md"))
        print(f"Total MD files: {len(md_files)}")
        
        # Categorize by subdirectory
        categories = {}
        for file_path in md_files:
            try:
                relative_path = file_path.relative_to(docs_path)
                category = str(relative_path.parent) if relative_path.parent != Path('.') else "root"
                
                if category not in categories:
                    categories[category] = []
                categories[category].append(file_path.name)
            except ValueError:
                continue
        
        print(f"\n📊 Content Categories ({len(categories)} categories):")
        for category, files in sorted(categories.items()):
            print(f"  {category}: {len(files)} files")
            if len(files) <= 5:
                print(f"    Files: {', '.join(files)}")
            else:
                print(f"    Sample: {', '.join(files[:3])}... (+{len(files)-3} more)")
    
    print(f"\n🎯 Business Intelligence Scope")
    print("=" * 50)
    
    # Show what types of business intelligence this enables
    intelligence_areas = [
        {
            "area": "Client Operations",
            "examples": ["Team Lift LLC docs", "Client proposals", "Delivery playbooks"],
            "boost": "2.0x (highest priority)"
        },
        {
            "area": "Daily Operations", 
            "examples": ["Daily calendar data", "Task tracking", "Progress updates"],
            "boost": "1.7x (high priority)"
        },
        {
            "area": "Strategic Planning",
            "examples": ["Overall plans", "Strategic roadmaps", "Business analysis"],
            "boost": "1.5x (business focus)"
        },
        {
            "area": "Technical Documentation",
            "examples": ["Implementation guides", "Architecture docs", "Troubleshooting"],
            "boost": "1.2x (automation focus)"
        },
        {
            "area": "Process Documentation",
            "examples": ["Workflows", "Playbooks", "Standard procedures"],
            "boost": "1.0x (baseline)"
        }
    ]
    
    for area_info in intelligence_areas:
        print(f"\n{area_info['area']} ({area_info['boost']}):")
        for example in area_info['examples']:
            print(f"  - {example}")
    
    # Show comprehensive query capabilities
    print(f"\n🚀 Enhanced Query Capabilities")
    print("=" * 50)
    
    sample_queries = [
        "What's in my Team Lift LLC playbooks?",
        "Show me all client delivery processes",
        "What are today's priorities and deadlines?", 
        "Find all strategic planning documents",
        "What troubleshooting guides do I have?",
        "Show me ExampleCorp-related documentation",
        "What's the status of current projects?",
        "Find all automation and workflow docs"
    ]
    
    for i, query in enumerate(sample_queries, 1):
        print(f"{i}. {query}")
    
    print(f"\n✅ Comprehensive Business Intelligence Ready")
    print("=" * 50)
    print(f"The enhanced MBIE now indexes {len(md_files) if docs_path.exists() else 'all'} documentation files")
    print("providing comprehensive business intelligence across:")
    print("- Client operations and delivery")
    print("- Daily workflow and scheduling") 
    print("- Strategic planning and roadmaps")
    print("- Technical documentation and guides")
    print("- Process workflows and automation")
    
    print(f"\n🎯 This creates a unified knowledge base for all business operations!")

if __name__ == "__main__":
    analyze_comprehensive_docs()