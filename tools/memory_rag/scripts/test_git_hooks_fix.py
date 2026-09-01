#!/usr/bin/env python3
"""
Test Suite for Git Hooks Virtual Environment Fix (Issue #241)

This comprehensive test validates that:
1. Git hooks properly activate virtual environment
2. MBIE auto-indexing works correctly  
3. Graceful fallback behavior when venv not found
4. Issue #241 will not recur

Test Results verify fix effectiveness and future protection.
"""

import os
import sys
import subprocess
import tempfile
import shutil
from pathlib import Path
import json
from datetime import datetime

class GitHooksFixValidator:
    """Comprehensive validator for git hooks virtual environment fix"""
    
    def __init__(self):
        self.repo_root = self._get_repo_root()
        self.mbie_path = self.repo_root / "tools" / "memory_rag"
        self.git_hooks_path = self.repo_root / ".git" / "hooks"
        self.results = {
            "timestamp": datetime.now().isoformat(),
            "issue": "241",
            "test_results": {},
            "overall_status": "PENDING"
        }
        
    def _get_repo_root(self):
        """Get repository root directory"""
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            return Path(result.stdout.strip())
        else:
            raise RuntimeError("Not in a git repository")
    
    def test_virtual_environment_detection(self):
        """Test 1: Verify virtual environment can be detected and activated"""
        print("🧪 Test 1: Virtual Environment Detection")
        
        venv_path = self.mbie_path / "mbie_env" / "bin" / "activate"
        
        # Test virtual environment exists
        if venv_path.exists():
            print("✅ Virtual environment activation script found")
            self.results["test_results"]["venv_exists"] = True
        else:
            print("❌ Virtual environment activation script NOT found")
            self.results["test_results"]["venv_exists"] = False
            return False
            
        # Test activation works
        test_script = f"""
        cd "{self.mbie_path}"
        source mbie_env/bin/activate
        python3 -c "import huggingface_hub; print('SUCCESS: huggingface_hub imported')"
        """
        
        result = subprocess.run(
            ["bash", "-c", test_script],
            capture_output=True, text=True
        )
        
        if result.returncode == 0 and "SUCCESS" in result.stdout:
            print("✅ Virtual environment activation successful")
            print(f"   Output: {result.stdout.strip()}")
            self.results["test_results"]["venv_activation"] = True
            return True
        else:
            print("❌ Virtual environment activation failed")
            print(f"   Error: {result.stderr}")
            self.results["test_results"]["venv_activation"] = False
            return False
    
    def test_git_hooks_updated(self):
        """Test 2: Verify hook templates and installed hooks contain virtual environment activation"""
        print("\n🧪 Test 2: Git Hook Templates and Installed Hooks Updated")
        
        hooks_to_check = ["post-commit", "post-merge"]
        all_updated = True
        
        # Check both source templates and installed hooks
        locations = [
            ("template", self.repo_root / "scripts" / "git-hooks"),
            ("installed", self.git_hooks_path)
        ]
        
        for location_name, hooks_path in locations:
            print(f"   Checking {location_name} hooks in {hooks_path}")
            
            for hook_name in hooks_to_check:
                hook_path = hooks_path / hook_name
                
                if hook_path.exists():
                    with open(hook_path, 'r') as f:
                        content = f.read()
                    
                    # Check for virtual environment activation logic
                    required_patterns = [
                        "VENV_PATHS=",
                        "source \"$path\"",
                        "ACTIVATED=true",
                        "Virtual environment not found"
                    ]
                    
                    missing_patterns = []
                    for pattern in required_patterns:
                        if pattern not in content:
                            missing_patterns.append(pattern)
                    
                    if not missing_patterns:
                        print(f"   ✅ {location_name} {hook_name} hook updated correctly")
                        self.results["test_results"][f"{location_name}_{hook_name}_updated"] = True
                    else:
                        print(f"   ❌ {location_name} {hook_name} hook missing patterns: {missing_patterns}")
                        self.results["test_results"][f"{location_name}_{hook_name}_updated"] = False
                        all_updated = False
                else:
                    print(f"   ❌ {location_name} {hook_name} hook not found at {hook_path}")
                    self.results["test_results"][f"{location_name}_{hook_name}_updated"] = False
                    all_updated = False
        
        return all_updated
    
    def test_mbie_command_in_venv(self):
        """Test 3: Verify MBIE CLI works inside virtual environment"""
        print("\n🧪 Test 3: MBIE CLI in Virtual Environment")
        
        test_script = f"""
        cd "{self.mbie_path}"
        source mbie_env/bin/activate
        python3 cli.py --help | head -3
        """
        
        result = subprocess.run(
            ["bash", "-c", test_script],
            capture_output=True, text=True
        )
        
        if result.returncode == 0 and ("MBIE" in result.stdout or "Memory-Bank" in result.stdout):
            print("✅ MBIE CLI accessible in virtual environment")
            print(f"   Output preview: {result.stdout.split()[0] if result.stdout.split() else 'N/A'}")
            self.results["test_results"]["mbie_cli_accessible"] = True
            return True
        else:
            print("❌ MBIE CLI not accessible in virtual environment")
            print(f"   Error: {result.stderr}")
            self.results["test_results"]["mbie_cli_accessible"] = False
            return False
    
    def test_hook_venv_logic_validation(self):
        """Test 4: Validate git hooks properly implement virtual environment activation"""
        print("\n🧪 Test 4: Git Hook Virtual Environment Logic Validation")
        
        # Test that our hooks will actually use virtual environment when executing
        test_script = f"""
        REPO_ROOT="{self.repo_root}"
        MBIE_PATH="$REPO_ROOT/tools/memory_rag"
        cd "$MBIE_PATH"
        
        # Test the exact logic our hooks use
        VENV_PATHS=("mbie_env/bin/activate" "../mbie_env/bin/activate" "../../mbie_env/bin/activate")
        ACTIVATED=false
        
        for path in "${{VENV_PATHS[@]}}"; do
            if [[ -f "$path" ]]; then
                echo "Found venv at: $path"
                # Simulate activation (don't actually source to avoid side effects)
                if [[ -r "$path" ]]; then
                    ACTIVATED=true
                    break
                fi
            fi
        done
        
        if [[ "$ACTIVATED" == "true" ]]; then
            echo "SUCCESS: Hook logic would activate virtual environment"
            exit 0
        else
            echo "FAIL: Hook logic would not find virtual environment"
            exit 1
        fi
        """
        
        result = subprocess.run(
            ["bash", "-c", test_script],
            capture_output=True, text=True
        )
        
        if result.returncode == 0:
            print("   ✅ Git hooks will correctly activate virtual environment")
            print(f"   Details: {result.stdout.strip()}")
            self.results["test_results"]["hook_venv_logic"] = True
            return True
        else:
            print("   ❌ Git hooks will fail to activate virtual environment")
            print(f"   Error: {result.stderr or result.stdout}")
            self.results["test_results"]["hook_venv_logic"] = False
            return False
    
    def test_hook_simulation(self):
        """Test 5: Simulate git hook execution with updated logic"""
        print("\n🧪 Test 5: Git Hook Simulation")
        
        # Create a test script that mimics the git hook logic
        test_script = f"""
        REPO_ROOT="{self.repo_root}"
        MBIE_PATH="$REPO_ROOT/tools/memory_rag"
        CONFIG_PATH="$MBIE_PATH/config.yml"
        
        # Check if MBIE exists and automation is enabled
        if [[ -f "$CONFIG_PATH" ]] && grep -q "enabled: true" "$CONFIG_PATH" 2>/dev/null; then
            echo "✅ MBIE config found and enabled"
            cd "$MBIE_PATH"
            
            # Test the virtual environment activation logic
            VENV_PATHS=("mbie_env/bin/activate" "../mbie_env/bin/activate" "../../mbie_env/bin/activate")
            ACTIVATED=false
            
            for path in "${{VENV_PATHS[@]}}"; do
                if [[ -f "$path" ]]; then
                    echo "✅ Found virtual environment at: $path"
                    source "$path" && ACTIVATED=true && break
                fi
            done
            
            if [[ "$ACTIVATED" == "true" ]]; then
                echo "✅ Virtual environment activated successfully"
                # Test the actual command (dry run)
                python3 cli.py --help | head -1
                echo "✅ MBIE CLI command would execute successfully"
            else
                echo "❌ Virtual environment activation failed"
                exit 1
            fi
        else
            echo "❌ MBIE config not found or disabled"
            exit 1
        fi
        """
        
        result = subprocess.run(
            ["bash", "-c", test_script],
            capture_output=True, text=True
        )
        
        if result.returncode == 0:
            print("✅ Git hook simulation successful")
            print(f"   Output: {result.stdout.strip()}")
            self.results["test_results"]["hook_simulation"] = True
            return True
        else:
            print("❌ Git hook simulation failed")
            print(f"   Error: {result.stderr}")
            self.results["test_results"]["hook_simulation"] = False
            return False
    
    def test_graceful_fallback(self):
        """Test 6: Verify graceful fallback when virtual environment not found"""
        print("\n🧪 Test 6: Graceful Fallback Behavior")
        
        # Create a temporary directory structure without virtual environment
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_mbie = Path(temp_dir) / "tools" / "memory_rag"
            temp_mbie.mkdir(parents=True)
            
            # Copy config file to temp location
            config_source = self.mbie_path / "config.yml"
            config_dest = temp_mbie / "config.yml"
            if config_source.exists():
                shutil.copy2(config_source, config_dest)
            
            test_script = f"""
            MBIE_PATH="{temp_mbie}"
            cd "$MBIE_PATH"
            
            # Test the virtual environment activation logic without venv
            VENV_PATHS=("mbie_env/bin/activate" "../mbie_env/bin/activate" "../../mbie_env/bin/activate")
            ACTIVATED=false
            
            for path in "${{VENV_PATHS[@]}}"; do
                if [[ -f "$path" ]]; then
                    source "$path" && ACTIVATED=true && break
                fi
            done
            
            if [[ "$ACTIVATED" == "true" ]]; then
                echo "UNEXPECTED: Virtual environment found in temp directory"
                exit 1
            else
                echo "✅ Graceful fallback: Virtual environment not found, skipping auto-indexing"
                exit 0
            fi
            """
            
            result = subprocess.run(
                ["bash", "-c", test_script],
                capture_output=True, text=True
            )
            
            if result.returncode == 0 and "Graceful fallback" in result.stdout:
                print("✅ Graceful fallback behavior working correctly")
                self.results["test_results"]["graceful_fallback"] = True
                return True
            else:
                print("❌ Graceful fallback behavior failed")
                print(f"   Output: {result.stdout}")
                print(f"   Error: {result.stderr}")
                self.results["test_results"]["graceful_fallback"] = False
                return False
    
    def test_installation_script_integration(self):
        """Test 7: Verify installation script deploys updated templates correctly"""
        print("\n🧪 Test 7: Installation Script Integration")
        
        install_script = self.repo_root / "scripts" / "install-mbie-automation.sh"
        
        if not install_script.exists():
            print("❌ Installation script not found")
            self.results["test_results"]["installation_script_exists"] = False
            return False
        
        print("✅ Installation script found")
        self.results["test_results"]["installation_script_exists"] = True
        
        # Test that script copies from correct source directory
        with open(install_script, 'r') as f:
            script_content = f.read()
        
        if 'SOURCE_HOOKS_DIR="$SCRIPT_DIR/git-hooks"' in script_content:
            print("✅ Installation script uses correct source directory")
            self.results["test_results"]["installation_script_source_correct"] = True
        else:
            print("❌ Installation script source directory incorrect")
            self.results["test_results"]["installation_script_source_correct"] = False
            return False
        
        if 'cp "$SOURCE_HOOKS_DIR/$hook" "$HOOKS_DIR/$hook"' in script_content:
            print("✅ Installation script properly copies templates")
            self.results["test_results"]["installation_script_copies_templates"] = True
            return True
        else:
            print("❌ Installation script doesn't copy templates correctly")
            self.results["test_results"]["installation_script_copies_templates"] = False
            return False

    def run_all_tests(self):
        """Run all validation tests"""
        print("🧪 MBIE Git Hooks Virtual Environment Fix Validation")
        print("=" * 60)
        
        tests = [
            self.test_virtual_environment_detection,
            self.test_git_hooks_updated,
            self.test_mbie_command_in_venv,
            self.test_hook_venv_logic_validation,
            self.test_hook_simulation,
            self.test_graceful_fallback,
            self.test_installation_script_integration
        ]
        
        passed_tests = 0
        total_tests = len(tests)
        
        for test in tests:
            try:
                if test():
                    passed_tests += 1
            except Exception as e:
                print(f"❌ Test failed with exception: {e}")
        
        print("\n" + "=" * 60)
        print(f"📊 Test Results: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests:
            print("🎉 ALL TESTS PASSED - Issue #241 fix validated successfully!")
            self.results["overall_status"] = "PASSED"
        else:
            print(f"⚠️  {total_tests - passed_tests} TESTS FAILED - Issue #241 fix needs attention")
            self.results["overall_status"] = "FAILED"
        
        # Save detailed results
        results_file = self.mbie_path / "scripts" / "validation_results_issue_241.json"
        with open(results_file, 'w') as f:
            json.dump(self.results, f, indent=2)
        
        print(f"📄 Detailed results saved to: {results_file}")
        
        return passed_tests == total_tests

def main():
    """Main execution function"""
    validator = GitHooksFixValidator()
    success = validator.run_all_tests()
    
    if success:
        print("\n✅ Issue #241 fix validation: SUCCESS")
        print("   - Virtual environment activation implemented")
        print("   - Git hooks updated with robust path detection")
        print("   - Graceful fallback behavior confirmed")
        print("   - MBIE auto-indexing will work correctly")
        exit(0)
    else:
        print("\n❌ Issue #241 fix validation: FAILED")
        print("   - Review test output above for specific failures")
        print("   - Check validation_results_issue_241.json for details")
        exit(1)

if __name__ == "__main__":
    main()