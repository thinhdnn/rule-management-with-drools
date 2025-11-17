#!/bin/bash

# Production run script (uses environment variables)
# Usage: 
#   export OPENAI_API_KEY="your-key"
#   export OPENAI_ENABLED=true
#   ./run-prod.sh

echo "🚀 Starting Spring Boot application with PRODUCTION profile..."
echo "📋 Using configuration from application.yml + environment variables"
echo ""

# Check if OpenAI is enabled
if [ "${OPENAI_ENABLED}" = "true" ]; then
    if [ -z "${OPENAI_API_KEY}" ]; then
        echo "⚠️  Warning: OPENAI_ENABLED=true but OPENAI_API_KEY is not set!"
        echo ""
        echo "To enable AI features, set:"
        echo "  export OPENAI_API_KEY='your-api-key'"
        echo ""
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        echo "✅ OpenAI API key detected"
    fi
else
    echo "ℹ️  AI features are disabled (OPENAI_ENABLED=${OPENAI_ENABLED:-false})"
fi

echo ""
echo "Starting application..."
echo ""

# Run with default profile
./gradlew bootRun

