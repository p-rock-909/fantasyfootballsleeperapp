#!/usr/bin/env python3
"""
Test script for MBIE health restoration fixes
Validates the fixes for Issue #237
"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime

# Add the parent directory to the path so we can import the module
sys.path.insert(0, str(Path(__file__).parent))

from weekly_mbie_learning import MBIELearningSystem

def test_data_persistence():
    """Test the learning data persistence functionality"""
    print("🧪 Testing learning data persistence...")
    
    system = MBIELearningSystem()
    
    # Create test analysis data
    test_analysis = {
        "analysis_date": datetime.now().isoformat(),
        "week_number": "33",
        "session_id": "test_session_123",
        "pattern_analysis": {
            "pattern_type": "test_domain_preference",
            "confidence": 0.95,
            "business_context": "test_q3_foundation",
            "recommendations": ["test_recommendation_1", "test_recommendation_2"]
        },
        "business_impact": {
            "time_savings_potential": "test_30%_improvement",
            "quality_improvement": "test_enhanced_context"
        }
    }
    
    # Test persistence without issue URL (simulating failure case)
    success = system.persist_learning_data(test_analysis, None)
    
    if success:
        print("✅ Data persistence test passed")
        return True
    else:
        print("❌ Data persistence test failed")
        return False

def test_github_username_fix():
    """Test that the GitHub username has been fixed"""
    print("🧪 Testing GitHub username fix...")
    
    # Read the script file and check for correct assignee
    script_path = Path(__file__).parent / "weekly_mbie_learning.py"
    with open(script_path, 'r') as f:
        content = f.read()
    
    # Check that old username is not present
    if '"assignees": ["virtuoso902"]' in content:
        print("❌ Old username 'virtuoso902' still found in script")
        return False
    
    # Check that new username is present
    if '"assignees": ["NoCapLife"]' in content:
        print("✅ GitHub username fix verified")
        return True
    else:
        print("❌ New username 'NoCapLife' not found in script")
        return False

def test_data_directory_structure():
    """Test that the data directory structure is properly created"""
    print("🧪 Testing data directory structure...")
    
    base_dir = Path(__file__).parent.parent / "data"
    required_dirs = [
        base_dir,
        base_dir / "analytics",
        base_dir / "learning",
        base_dir / "learning" / "weekly_insights",
        base_dir / "learning" / "pattern_analysis",
        base_dir / "backups"
    ]
    
    all_exist = True
    for dir_path in required_dirs:
        if not dir_path.exists():
            print(f"❌ Missing directory: {dir_path}")
            all_exist = False
        else:
            print(f"✅ Directory exists: {dir_path}")
    
    return all_exist

def test_analytics_files():
    """Test that analytics files were created properly"""
    print("🧪 Testing analytics files...")
    
    analytics_dir = Path(__file__).parent.parent / "data" / "analytics"
    required_files = [
        analytics_dir / "query_patterns.json",
        analytics_dir / "user_interactions.json", 
        analytics_dir / "satisfaction_scores.json"
    ]
    
    all_exist = True
    for file_path in required_files:
        if not file_path.exists():
            print(f"❌ Missing file: {file_path}")
            all_exist = False
        else:
            # Test that files contain valid JSON
            try:
                with open(file_path, 'r') as f:
                    json.load(f)
                print(f"✅ Valid JSON file: {file_path}")
            except json.JSONDecodeError:
                print(f"❌ Invalid JSON in file: {file_path}")
                all_exist = False
    
    return all_exist

def main():
    """Run all tests"""
    print("🔧 MBIE Health Restoration - Testing Fixes for Issue #237")
    print("=" * 60)
    
    tests = [
        ("Data Directory Structure", test_data_directory_structure),
        ("Analytics Files", test_analytics_files),
        ("GitHub Username Fix", test_github_username_fix),
        ("Data Persistence", test_data_persistence),
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
    print("📊 Test Results Summary:")
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {test_name}")
        if result:
            passed += 1
    
    print(f"\n🎯 Overall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! MBIE health restoration fixes are working correctly.")
        return 0
    else:
        print("⚠️ Some tests failed. Please review the issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())