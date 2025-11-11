#!/bin/bash

# Drools UI Live Demo Trigger Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Check if gh CLI is installed
check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        print_error "GitHub CLI (gh) is not installed!"
        print_info "Install it from: https://cli.github.com/"
        exit 1
    fi
    
    # Check if authenticated
    if ! gh auth status &> /dev/null; then
        print_error "GitHub CLI is not authenticated!"
        print_info "Run: gh auth login"
        exit 1
    fi
}

# Show help
show_help() {
    print_header "Drools UI Live Demo Trigger"
    echo ""
    echo "This script triggers a GitHub Actions workflow to create a live demo"
    echo "with public URLs using ngrok for both frontend and backend."
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -d, --duration MINUTES    Demo duration in minutes (default: 10)"
    echo "  -m, --message MESSAGE     Demo description message"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                       # Quick 10-minute demo"
    echo "  $0 -d 5                  # 5-minute demo"
    echo "  $0 -d 15 -m \"Feature X Demo\"  # Custom demo with message"
    echo ""
    print_warn "Note: You need NGROK_AUTH_TOKEN secret configured in your GitHub repo"
}

# Default values
DURATION="10"
MESSAGE="Drools UI Live Demo"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -d|--duration)
            DURATION="$2"
            shift 2
            ;;
        -m|--message)
            MESSAGE="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate duration
if ! [[ "$DURATION" =~ ^[0-9]+$ ]] || [ "$DURATION" -lt 1 ] || [ "$DURATION" -gt 15 ]; then
    print_error "Duration must be a number between 1 and 15 minutes"
    exit 1
fi

# Main execution
main() {
    print_header "Starting Drools UI Live Demo"
    
    check_gh_cli
    
    print_info "Demo Configuration:"
    echo "  Duration: $DURATION minutes"
    echo "  Message: $MESSAGE"
    echo ""
    
    print_warn "This will create a temporary live demo with public URLs."
    print_warn "The demo will automatically stop after $DURATION minutes."
    echo ""
    
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Demo cancelled."
        exit 0
    fi
    
    print_info "Triggering GitHub Actions workflow..."
    
    # Trigger the workflow
    gh workflow run demo-deploy.yml \
        --field demo_duration="$DURATION" \
        --field demo_message="$MESSAGE"
    
    if [ $? -eq 0 ]; then
        print_info "✅ Workflow triggered successfully!"
        echo ""
        print_info "🔗 Monitor progress:"
        echo "   https://github.com/$(gh repo view --json owner,name -q '.owner.login + "/" + .name')/actions"
        echo ""
        print_info "📝 Demo URLs will be available in:"
        print_info "   - GitHub Actions workflow summary"
        print_info "   - GitHub issue (if permissions allow)"
        print_info "⏰ Demo will run for $DURATION minutes."
        echo ""
        
        # Optionally open the actions page
        read -p "Open GitHub Actions in browser? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            gh repo view --web --branch main
        fi
        
    else
        print_error "Failed to trigger workflow!"
        exit 1
    fi
}

# Run main function
main