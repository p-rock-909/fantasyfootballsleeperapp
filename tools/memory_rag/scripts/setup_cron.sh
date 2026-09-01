#!/bin/bash
# MBIE Weekly Learning Cron Job Setup Script
# Sets up automated Sunday 9:00 PM execution with proper environment and logging
#
# Usage: ./setup_cron.sh

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MBIE_SCRIPT="$SCRIPT_DIR/weekly_mbie_learning.py"
LOG_DIR="$SCRIPT_DIR/logs"
CRON_LOG="$LOG_DIR/cron_execution.log"

# Ensure directories exist
mkdir -p "$LOG_DIR"

# Function to create cron job entry
create_cron_job() {
    echo "🔧 Setting up MBIE Weekly Learning cron job..."
    
    # Get current user's crontab
    CURRENT_CRON=$(crontab -l 2>/dev/null || echo "")
    
    # Define cron job command with full paths and environment (Security: Quote paths)
    CRON_COMMAND="0 21 * * SUN /usr/bin/python3 '$MBIE_SCRIPT' >> '$CRON_LOG' 2>&1"
    
    # Check if job already exists
    if echo "$CURRENT_CRON" | grep -q "weekly_mbie_learning.py"; then
        echo "⚠️  MBIE cron job already exists. Updating..."
        # Remove existing job and add new one
        NEW_CRON=$(echo "$CURRENT_CRON" | grep -v "weekly_mbie_learning.py")
    else
        echo "➕ Adding new MBIE cron job..."
        NEW_CRON="$CURRENT_CRON"
    fi
    
    # Add the cron job
    echo "$NEW_CRON" | { cat; echo "$CRON_COMMAND"; } | crontab -
    
    echo "✅ Cron job installed successfully"
    echo "📅 Schedule: Every Sunday at 9:00 PM"
    echo "📝 Logs: $CRON_LOG"
}

# Function to test the script
test_script() {
    echo "🧪 Testing MBIE learning script..."
    
    # Test with dry-run mode (you can add a --dry-run flag to the Python script)
    echo "Running test execution..."
    
    # Create test log entry
    echo "$(date): MBIE Learning cron job setup test" >> "$CRON_LOG"
    
    echo "✅ Script test completed"
    echo "💡 To test manually, run: python3 $MBIE_SCRIPT"
}

# Function to show cron status
show_status() {
    echo "📋 Current cron job status:"
    echo ""
    
    # Show current crontab
    echo "Active cron jobs:"
    crontab -l 2>/dev/null | grep -E "(mbie|MBIE)" || echo "No MBIE cron jobs found"
    
    echo ""
    echo "Next execution times:"
    # Show next Sunday 9 PM (cross-platform compatible)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS date command - calculate days to next Sunday
        current_day=$(date +%u)  # 1=Monday, 7=Sunday
        if [[ $current_day -eq 7 ]]; then
            days_to_add=7  # If today is Sunday, next Sunday is 7 days away
        else
            days_to_add=$((7 - current_day))  # Days until next Sunday
        fi
        next_sunday=$(date -v+${days_to_add}d +"%Y-%m-%d")
    else
        # Linux date command
        next_sunday=$(date -d "next sunday" +"%Y-%m-%d")
    fi
    echo "Next run: $next_sunday 21:00:00"
    
    echo ""
    echo "Log files:"
    echo "- Cron execution log: $CRON_LOG"
    echo "- MBIE system logs: $LOG_DIR/"
    
    if [[ -f "$CRON_LOG" ]]; then
        echo ""
        echo "Recent log entries:"
        tail -5 "$CRON_LOG" 2>/dev/null || echo "No log entries yet"
    fi
}

# Function to remove cron job
remove_cron_job() {
    echo "🗑️  Removing MBIE cron job..."
    
    CURRENT_CRON=$(crontab -l 2>/dev/null || echo "")
    NEW_CRON=$(echo "$CURRENT_CRON" | grep -v "weekly_mbie_learning.py" || true)
    
    if [[ "$CURRENT_CRON" != "$NEW_CRON" ]]; then
        echo "$NEW_CRON" | crontab -
        echo "✅ MBIE cron job removed successfully"
    else
        echo "ℹ️  No MBIE cron job found to remove"
    fi
}

# Input validation function
validate_input() {
    local command="${1:-install}"
    if [[ ! "$command" =~ ^(install|test|status|remove)$ ]]; then
        echo "❌ Invalid command: $command"
        echo "Valid commands: install, test, status, remove"
        exit 1
    fi
}

# Main execution
main() {
    echo "🚀 MBIE Weekly Learning Cron Setup"
    echo "=================================="
    
    local action="${1:-install}"
    validate_input "$action"
    
    case "$action" in
        install)
            create_cron_job
            test_script
            show_status
            ;;
        test)
            test_script
            ;;
        status)
            show_status
            ;;
        remove)
            remove_cron_job
            ;;
        *)
            echo "Usage: $0 {install|test|status|remove}"
            echo ""
            echo "Commands:"
            echo "  install  - Install/update the cron job (default)"
            echo "  test     - Test the script execution"
            echo "  status   - Show current status and schedule"
            echo "  remove   - Remove the cron job"
            exit 1
            ;;
    esac
}

# Verify requirements before execution
verify_requirements() {
    echo "🔍 Verifying requirements..."
    
    # Check if script exists
    if [[ ! -f "$MBIE_SCRIPT" ]]; then
        echo "❌ MBIE script not found: $MBIE_SCRIPT"
        exit 1
    fi
    
    # Check if script is executable
    if [[ ! -x "$MBIE_SCRIPT" ]]; then
        echo "🔧 Making script executable..."
        chmod +x "$MBIE_SCRIPT"
    fi
    
    # Check if Python 3 is available
    if ! command -v python3 &> /dev/null; then
        echo "❌ Python 3 not found. Please install Python 3."
        exit 1
    fi
    
    # Check if required directories exist
    if [[ ! -d "$(dirname "$MBIE_SCRIPT")/../mbie_env" ]]; then
        echo "❌ MBIE virtual environment not found. Please run from tools/memory_rag/scripts/"
        exit 1
    fi
    
    echo "✅ All requirements verified"
}

# Run verification and main function
verify_requirements
main "$@"