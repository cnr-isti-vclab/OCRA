#!/bin/bash

# Test OAuth Endpoint
# This script tests if the /oauth/token endpoint is accessible

echo "🧪 Testing OAuth Token Exchange Endpoint"
echo "========================================="
echo ""

# Get API base URL from environment or use default
API_BASE="${VITE_API_BASE:-http://localhost:3002}"

echo "API Base URL: $API_BASE"
echo ""

# Test 1: Check if endpoint exists (should return 400 with missing parameters)
echo "Test 1: POST to /oauth/token without parameters (should return 400)"
echo "Command: curl -X POST $API_BASE/oauth/token"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_BASE/oauth/token" -H "Content-Type: application/json")
HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo "Status: $HTTP_STATUS"
echo "Response: $BODY"
echo ""

if [ "$HTTP_STATUS" == "400" ]; then
  echo "✅ Test 1 PASSED: Endpoint exists and returns 400 for missing parameters"
else
  echo "❌ Test 1 FAILED: Expected 400, got $HTTP_STATUS"
  echo "   This might mean the endpoint is not mounted or not accessible"
fi

echo ""
echo "========================================="
echo ""

# Test 2: Send request with parameters (will fail token exchange, but tests the flow)
echo "Test 2: POST to /oauth/token with dummy parameters (should reach backend)"
echo "Command: curl -X POST $API_BASE/oauth/token with test data"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_BASE/oauth/token" \
  -H "Content-Type: application/json" \
  -d '{"code":"test_code","codeVerifier":"test_verifier","redirectUri":"http://localhost:3001"}')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')

echo "Status: $HTTP_STATUS"
echo "Response: $BODY"
echo ""

if [ "$HTTP_STATUS" == "400" ] || [ "$HTTP_STATUS" == "401" ] || [ "$HTTP_STATUS" == "500" ]; then
  echo "✅ Test 2 PASSED: Backend processed the request"
  echo "   (Error expected since we're using dummy data)"
else
  echo "❌ Test 2 FAILED: Unexpected response"
fi

echo ""
echo "========================================="
echo ""

# Test 3: Check backend logs
echo "Test 3: Check if logs appear in backend"
echo ""
echo "Run this command to see backend logs:"
echo "  docker compose logs backend --tail=50 | grep -i oauth"
echo ""
echo "You should see lines like:"
echo "  📋 [Routes] Mounting API routes..."
echo "  ✅ [Routes] Mounted: /oauth"
echo "  🔍 [OAuth Routes] POST /token"
echo "  🚀 [OAuth] Token exchange endpoint called"
echo ""

# Test 4: Check environment variables
echo "========================================="
echo ""
echo "Test 4: Check OAuth environment variables"
echo ""
echo "Run these commands on the server:"
echo "  docker compose exec backend printenv | grep ISSUER"
echo "  docker compose exec backend printenv | grep CLIENT_ID"
echo "  docker compose exec backend printenv | grep CLIENT_SECRET"
echo ""
echo "All three should have values. If CLIENT_SECRET is empty, that's the problem!"
echo ""

echo "========================================="
echo "📝 Summary"
echo "========================================="
echo ""
echo "If Test 1 FAILED:"
echo "  - The /oauth route is not mounted"
echo "  - Check if oauth.routes.ts is imported in routes/index.ts"
echo "  - Rebuild: docker compose up -d --build"
echo ""
echo "If Test 1 PASSED but no logs appear:"
echo "  - Frontend might not be calling the endpoint"
echo "  - Check browser Network tab for /oauth/token request"
echo "  - Check VITE_API_BASE environment variable"
echo ""
echo "If logs show 'Configuration missing':"
echo "  - CLIENT_SECRET not in .env.prod"
echo "  - Add: CLIENT_SECRET=<your_secret>"
echo "  - Restart: docker compose restart backend"
echo ""
