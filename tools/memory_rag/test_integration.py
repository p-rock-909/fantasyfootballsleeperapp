#!/usr/bin/env python3
"""
Test script for Enhanced Solution 3: Local Claude + API Integration
Tests all components needed for MBIE learning automation
"""

import subprocess
import json
import os
import sys
from pathlib import Path

def test_mbie_analysis():
    """Test MBIE analysis generation"""
    print("🧪 Testing MBIE analysis...")
    
    try:
        # Change to MBIE directory
        os.chdir(Path(__file__).parent)
        
        # Activate virtual environment and run MBIE query
        result = subprocess.run([
            'bash', '-c', 
            'source mbie_env/bin/activate && python mbie.py query "current focus" --current-only'
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            print("✅ MBIE analysis working")
            return {"status": "success", "sample_output": result.stdout[:200] + "..."}
        else:
            print(f"❌ MBIE analysis failed: {result.stderr}")
            return {"status": "error", "error": result.stderr}
            
    except Exception as e:
        print(f"❌ MBIE test exception: {e}")
        return {"status": "error", "error": str(e)}

def test_claude_code_cli():
    """Test Claude Code CLI availability and basic functionality"""
    print("🧪 Testing Claude Code CLI...")
    
    try:
        # Test Claude Code CLI with simple prompt
        result = subprocess.run([
            'claude', '--print', 
            'Create a simple test response: "Claude Code is working"'
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            print("✅ Claude Code CLI working")
            return {"status": "success", "sample_output": result.stdout[:200]}
        else:
            print(f"❌ Claude Code CLI failed: {result.stderr}")
            return {"status": "error", "error": result.stderr}
            
    except Exception as e:
        print(f"❌ Claude Code test exception: {e}")
        return {"status": "error", "error": str(e)}

def test_github_api_access():
    """Test GitHub API access for issue creation"""
    print("🧪 Testing GitHub API access...")
    
    try:
        import requests
        
        # Get GitHub token from gh CLI
        token_result = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True)
        if token_result.returncode != 0:
            return {"status": "error", "error": "Cannot get GitHub token from gh CLI"}
        
        token = token_result.stdout.strip()
        
        # Test API access with user endpoint
        headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        response = requests.get("https://api.github.com/user", headers=headers, timeout=10)
        
        if response.status_code == 200:
            user_data = response.json()
            print(f"✅ GitHub API access working for user: {user_data.get('login', 'unknown')}")
            return {"status": "success", "user": user_data.get('login')}
        else:
            print(f"❌ GitHub API failed: {response.status_code}")
            return {"status": "error", "error": f"API returned {response.status_code}"}
            
    except Exception as e:
        print(f"❌ GitHub API test exception: {e}")
        return {"status": "error", "error": str(e)}

def test_integrated_workflow():
    """Test the complete integrated workflow"""
    print("🧪 Testing integrated workflow...")
    
    try:
        # 1. Generate sample MBIE analysis
        mbie_result = test_mbie_analysis()
        if mbie_result["status"] != "success":
            return {"status": "error", "step": "mbie_analysis", "error": mbie_result.get("error")}
        
        # 2. Create enhanced analysis with Claude
        sample_analysis = {
            "pattern": "domain_preference", 
            "confidence": 0.89,
            "recommendations": ["Boost business domain files by 1.6x"]
        }
        
        claude_prompt = f"""
        Create a strategic GitHub issue for MBIE learning recommendation.
        
        Context: Q3 Foundation Quarter, Example Client engagement
        Analysis Data: {json.dumps(sample_analysis, indent=2)}
        
        Generate a professional issue with:
        - Strategic business context awareness
        - Implementation strategy
        - Success metrics
        
        Format as GitHub issue with sections and checkboxes.
        Keep response under 500 words for testing.
        """
        
        claude_result = subprocess.run([
            'claude', '--print', claude_prompt
        ], capture_output=True, text=True, timeout=30)
        
        if claude_result.returncode != 0:
            return {"status": "error", "step": "claude_enhancement", "error": claude_result.stderr}
        
        enhanced_content = claude_result.stdout
        print("✅ Claude enhancement working")
        
        # 3. Test GitHub API integration (dry run - don't create actual issue)
        api_result = test_github_api_access()
        if api_result["status"] != "success":
            return {"status": "error", "step": "github_api", "error": api_result.get("error")}
        
        print("✅ Complete workflow tested successfully")
        return {
            "status": "success", 
            "enhanced_content_preview": enhanced_content[:300] + "...",
            "github_user": api_result.get("user")
        }
        
    except Exception as e:
        print(f"❌ Integrated workflow test exception: {e}")
        return {"status": "error", "error": str(e)}

def main():
    """Run all integration tests"""
    print("🧪 Enhanced Solution 3 Integration Test")
    print("=" * 50)
    
    # Run individual component tests
    results = {
        "mbie_analysis": test_mbie_analysis(),
        "claude_code_cli": test_claude_code_cli(), 
        "github_api_access": test_github_api_access(),
        "integrated_workflow": test_integrated_workflow()
    }
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 50)
    
    all_passed = True
    for test_name, result in results.items():
        status_emoji = "✅" if result["status"] == "success" else "❌"
        print(f"{status_emoji} {test_name}: {result['status']}")
        if result["status"] != "success":
            all_passed = False
            print(f"   Error: {result.get('error', 'Unknown error')}")
    
    print("\n" + "=" * 50)
    if all_passed:
        print("🎉 ALL TESTS PASSED - Enhanced Solution 3 is ready for implementation!")
    else:
        print("⚠️ SOME TESTS FAILED - Review errors before implementation")
    
    print("=" * 50)
    return results

if __name__ == "__main__":
    results = main()
    # Exit with error code if any tests failed
    if any(r["status"] != "success" for r in results.values()):
        sys.exit(1)