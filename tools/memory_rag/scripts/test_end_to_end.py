#!/usr/bin/env python3
"""
End-to-end test for MBIE learning workflow
Tests complete workflow without creating actual GitHub issues
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime
import subprocess

# Add the parent directory to the path so we can import the module
sys.path.insert(0, str(Path(__file__).parent))

from weekly_mbie_learning import MBIELearningSystem

class TestMBIELearningSystem(MBIELearningSystem):
    """Test version that doesn't create actual GitHub issues"""
    
    def create_github_issue(self, enhanced_content, analysis_data):
        """Mock GitHub issue creation for testing"""
        self.logger.info("TEST MODE: Simulating GitHub issue creation...")
        
        # Simulate successful issue creation
        week_num = analysis_data.get('week_number', datetime.now().strftime("%U"))
        mock_issue_url = f"https://github.com/NoCapLife/Personal/issues/TEST-{week_num}"
        
        self.logger.info(f"TEST MODE: Mock issue would be created at: {mock_issue_url}")
        return mock_issue_url
    
    def add_to_randys_board(self, issue_node_id, issue_number):
        """Mock Randy's Board integration for testing"""
        self.logger.info(f"TEST MODE: Simulating adding issue #{issue_number} to Randy's Board...")
        return True

def test_mbie_analysis():
    """Test MBIE analysis generation"""
    print("🧪 Testing MBIE analysis generation...")
    
    system = TestMBIELearningSystem()
    
    try:
        analysis_data = system.run_mbie_analysis()
        
        # Verify analysis structure
        required_keys = ['analysis_date', 'week_number', 'session_id', 'pattern_analysis', 'business_impact']
        for key in required_keys:
            if key not in analysis_data:
                print(f"❌ Missing key in analysis: {key}")
                return False
        
        print("✅ MBIE analysis generation successful")
        return True, analysis_data
        
    except Exception as e:
        print(f"❌ MBIE analysis failed: {e}")
        return False, None

def test_claude_enhancement():
    """Test Claude enhancement functionality"""
    print("🧪 Testing Claude enhancement...")
    
    system = TestMBIELearningSystem()
    
    # Create test analysis data
    test_analysis = {
        "analysis_date": datetime.now().isoformat(),
        "week_number": "33",
        "pattern_analysis": {
            "pattern_type": "domain_preference",
            "confidence": 0.89,
            "business_context": "Q3_foundation_quarter_client_andrew",
            "key_findings": ["Test finding 1", "Test finding 2"],
            "recommendations": ["Test recommendation 1", "Test recommendation 2"]
        },
        "business_impact": {
            "time_savings_potential": "20% faster document discovery",
            "quality_improvement": "Better context alignment"
        }
    }
    
    try:
        enhanced_content = system.enhance_with_claude(test_analysis)
        
        if enhanced_content and len(enhanced_content) > 100:
            print("✅ Claude enhancement successful")
            return True, enhanced_content
        else:
            print("❌ Claude enhancement returned insufficient content")
            return False, None
            
    except Exception as e:
        print(f"❌ Claude enhancement failed: {e}")
        return False, None

def test_complete_workflow():
    """Test the complete learning workflow"""
    print("🧪 Testing complete learning workflow...")
    
    system = TestMBIELearningSystem()
    
    try:
        result = system.run_weekly_analysis()
        
        if result.get("status") == "success":
            print("✅ Complete workflow test successful")
            print(f"   Mock Issue URL: {result.get('issue_url')}")
            print(f"   Session ID: {result.get('session_id')}")
            return True
        else:
            print(f"❌ Complete workflow failed: {result.get('error', 'Unknown error')}")
            return False
            
    except Exception as e:
        print(f"❌ Complete workflow failed with exception: {e}")
        return False

def verify_data_persistence():
    """Verify that data was persisted during testing"""
    print("🧪 Verifying data persistence...")
    
    data_dir = Path(__file__).parent.parent / "data"
    
    # Check for new weekly insights
    insights_dir = data_dir / "learning" / "weekly_insights"
    if not insights_dir.exists():
        print("❌ Weekly insights directory missing")
        return False
    
    # Check for analytics updates
    patterns_file = data_dir / "analytics" / "query_patterns.json"
    if not patterns_file.exists():
        print("❌ Query patterns file missing")
        return False
    
    try:
        with open(patterns_file, 'r') as f:
            patterns_data = json.load(f)
        
        today = datetime.now().strftime("%Y-%m-%d")
        if today in patterns_data.get("query_patterns", {}):
            print("✅ Data persistence verified - patterns updated")
            return True
        else:
            print("❌ Data persistence verification failed - no today's patterns")
            return False
            
    except Exception as e:
        print(f"❌ Data persistence verification failed: {e}")
        return False

def main():
    """Run end-to-end testing"""
    print("🔧 MBIE Learning System - End-to-End Testing")
    print("=" * 60)
    
    tests = [
        ("MBIE Analysis Generation", lambda: test_mbie_analysis()[0]),
        ("Claude Enhancement", lambda: test_claude_enhancement()[0]),
        ("Complete Workflow", test_complete_workflow),
        ("Data Persistence Verification", verify_data_persistence),
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n📋 Running: {test_name}")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ Test '{test_name}' failed with error: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 60)
    print("📊 End-to-End Test Results:")
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")
        if result:
            passed += 1
    
    print(f"\n🎯 Overall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All end-to-end tests passed! MBIE learning system is fully operational.")
        return 0
    else:
        print("⚠️ Some tests failed. MBIE learning system needs attention.")
        return 1

if __name__ == "__main__":
    sys.exit(main())