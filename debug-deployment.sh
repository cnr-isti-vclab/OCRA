#!/bin/bash
# OCRA Deployment Debug Script
# Run this on your server to diagnose OAuth/Keycloak issues

echo "============================================"
echo "OCRA Deployment Diagnostics"
echo "============================================"
echo ""

# Check if .env file exists
echo "1. Checking .env file..."
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    echo ""
    echo "Environment variables in .env:"
    grep -E "^[A-Z_]+" .env | grep -v PASSWORD | grep -v ADMIN
    echo ""
else
    echo "❌ .env file NOT FOUND!"
    echo "   Create it in the project root directory"
    echo ""
fi

# Check running containers
echo "2. Checking Docker containers..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep ocra
echo ""

# Check frontend config.js
echo "3. Checking frontend config.js (OAuth settings)..."
if docker ps | grep -q ocra-frontend; then
    docker exec ocra-frontend cat /usr/share/nginx/html/config.js
    echo ""
else
    echo "❌ Frontend container not running!"
    echo ""
fi

# Check if URLs contain localhost
echo "4. Checking for localhost in config..."
if docker ps | grep -q ocra-frontend; then
    if docker exec ocra-frontend cat /usr/share/nginx/html/config.js | grep -q localhost; then
        echo "⚠️  WARNING: config.js still contains 'localhost'"
        echo "   This means environment variables are not being applied correctly"
        echo ""
    else
        echo "✅ No localhost found in config.js"
        echo ""
    fi
fi

# Test Keycloak accessibility
echo "5. Testing Keycloak availability..."
if command -v curl &> /dev/null; then
    KEYCLOAK_URL=$(grep PROVIDER_URL .env 2>/dev/null | cut -d'=' -f2)
    if [ -n "$KEYCLOAK_URL" ]; then
        echo "Testing: $KEYCLOAK_URL/realms/demo/.well-known/openid-configuration"
        if curl -s -o /dev/null -w "%{http_code}" "$KEYCLOAK_URL/realms/demo/.well-known/openid-configuration" | grep -q 200; then
            echo "✅ Keycloak is accessible"
        else
            echo "❌ Keycloak is NOT accessible at $KEYCLOAK_URL"
        fi
    fi
    echo ""
fi

# Check frontend accessibility
echo "6. Testing frontend accessibility..."
FRONTEND_URL=$(grep REDIRECT_URI .env 2>/dev/null | cut -d'=' -f2)
if [ -n "$FRONTEND_URL" ] && command -v curl &> /dev/null; then
    echo "Testing: $FRONTEND_URL"
    if curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" | grep -q 200; then
        echo "✅ Frontend is accessible"
    else
        echo "❌ Frontend is NOT accessible at $FRONTEND_URL"
    fi
    echo ""
fi

# Check recent logs for errors
echo "7. Recent frontend logs (last 20 lines)..."
if docker ps | grep -q ocra-frontend; then
    docker logs --tail 20 ocra-frontend 2>&1
    echo ""
fi

echo "8. Recent backend logs (last 20 lines)..."
if docker ps | grep -q ocra-backend; then
    docker logs --tail 20 ocra-backend 2>&1
    echo ""
fi

# Browser console debugging tips
echo "============================================"
echo "Next Steps for Debugging:"
echo "============================================"
echo ""
echo "1. Open browser console (F12) on your frontend URL"
echo "2. Look for these common errors:"
echo "   - CORS errors → Check Keycloak Web Origins"
echo "   - 'redirect_uri' mismatch → Check Keycloak Valid Redirect URIs"
echo "   - Network errors → Check if Keycloak is accessible from browser"
echo ""
echo "3. In browser console, check the config:"
echo "   Type: window.__APP_CONFIG__"
echo "   Should show your server URLs, not localhost"
echo ""
echo "4. Check Network tab when clicking Login:"
echo "   - Should redirect to: http://your-server:8081/realms/demo/protocol/openid-connect/auth"
echo "   - If it goes to localhost:8081, config is wrong"
echo ""
echo "5. Common fixes:"
echo "   a) If config.js has localhost:"
echo "      - Verify .env file is in project root"
echo "      - Run: docker-compose down && docker-compose up --build -d"
echo ""
echo "   b) If redirect_uri error:"
echo "      - Check Keycloak client settings match .env exactly"
echo "      - Include trailing /* in Valid Redirect URIs"
echo ""
echo "   c) If CORS error:"
echo "      - Add your domain to Keycloak Web Origins"
echo "      - No trailing slash or /* needed"
echo ""
