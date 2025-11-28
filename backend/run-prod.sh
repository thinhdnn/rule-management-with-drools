#!/bin/bash

# Production run script (uses environment variables)
# Usage: 
#   export AI_API_KEY="your-key"
#   export AI_ENABLED=true
#   export AI_PROVIDER=openrouter  # Optional: "openrouter" (default) or "openai"
#   ./run-prod.sh

echo "🚀 Starting Spring Boot application with PRODUCTION profile..."
echo "📋 Using configuration from application.yml + environment variables"
echo ""

# Check if AI is enabled
if [ "${AI_ENABLED}" = "true" ]; then
    if [ -z "${AI_API_KEY}" ]; then
        echo "⚠️  Warning: AI_ENABLED=true but AI_API_KEY is not set!"
        echo ""
        echo "To enable AI features, set:"
        echo "  export AI_API_KEY='your-api-key'"
        echo "  export AI_PROVIDER=openrouter  # Optional: 'openrouter' (default) or 'openai'"
        echo ""
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        PROVIDER=${AI_PROVIDER:-openrouter}
        echo "✅ AI API key detected (provider: ${PROVIDER})"
    fi
else
    echo "ℹ️  AI features are disabled (AI_ENABLED=${AI_ENABLED:-false})"
fi

echo ""
echo "Starting application..."
echo ""

# Run with default profile
./gradlew bootRun

