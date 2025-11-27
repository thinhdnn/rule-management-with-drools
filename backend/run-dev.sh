#!/bin/bash

set -e

# Development run script with dev profile
# Usage: ./run-dev.sh [-rm|--recreate-docker]

print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -rm, --recreate-docker   Run 'docker compose down --volumes --remove-orphans' then 'docker compose up -d'"
    echo "  -h,  --help              Show this help message"
}

RECREATE_DOCKER=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -rm|--recreate-docker)
            RECREATE_DOCKER=true
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo ""
            print_usage
            exit 1
            ;;
    esac
done

echo "🚀 Starting Spring Boot application with DEV profile..."
echo "📋 Using configuration from application-dev.yml"
echo ""

# Check if application-dev.yml exists
if [ ! -f "src/main/resources/application-dev.yml" ]; then
    echo "❌ Error: application-dev.yml not found!"
    echo ""
    echo "Please create it from template:"
    echo "  cd src/main/resources"
    echo "  cp application-dev.yml.template application-dev.yml"
    echo "  # Edit application-dev.yml and add your API key"
    echo ""
    exit 1
fi

if [ "$RECREATE_DOCKER" = true ]; then
    echo "🐳 Recreating Docker services..."
    if ! command -v docker &> /dev/null; then
        echo "❌ Error: docker is not installed or not available in PATH"
        exit 1
    fi

    if ! command -v docker compose &> /dev/null; then
        echo "❌ Error: docker compose plugin is not available"
        exit 1
    fi

    if [ ! -f "docker-compose.yml" ]; then
        echo "❌ Error: docker-compose.yml not found in $(pwd)"
        exit 1
    fi

    docker compose down --volumes --remove-orphans
    docker compose up -d
    echo "✅ Docker services recreated"
    echo ""
fi

# Kill any process using port 8080
echo "🔍 Checking port 8080..."
PORT_PID=$(lsof -ti:8080 2>/dev/null || true)
if [ ! -z "$PORT_PID" ]; then
    echo "⚠️  Port 8080 is in use by process $PORT_PID"
    echo "🛑 Stopping existing process..."
    kill -9 $PORT_PID
    sleep 2
    echo "✅ Port 8080 is now free"
else
    echo "✅ Port 8080 is available"
fi
echo ""

# Run with dev profile
./gradlew bootRun --args='--spring.profiles.active=dev'

