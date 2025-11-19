#!/bin/bash

echo "🧪 Testing backend endpoints..."

# Test direct localhost access
echo ""
echo "1. Testing direct localhost:9031/api/v1/rules (should work):"
curl -v http://localhost:9031/api/v1/rules 2>&1 | head -20

echo ""
echo "2. Testing direct localhost:9031/actuator/health (should work):"
curl -v http://localhost:9031/actuator/health 2>&1 | head -20

echo ""
echo "3. Testing health endpoint:"
curl -v http://localhost:9031/actuator/health 2>&1 | head -20

echo ""
echo "✅ Test completed"
