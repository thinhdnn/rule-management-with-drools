#!/bin/bash

# Development run script with dev profile
# Usage: ./run-dev.sh

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

# Kill any process using port 8080
echo "🔍 Checking port 8080..."
PORT_PID=$(lsof -ti:8080)
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

