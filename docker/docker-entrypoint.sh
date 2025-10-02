#!/usr/bin/env sh
set -eu

# Generate /usr/share/nginx/html/config.js from env vars if provided
cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  providerUrl: "${PROVIDER_URL:-}",
  realm: "${REALM:-}",
  issuer: "${ISSUER:-}",
  clientId: "${CLIENT_ID:-}",
  redirectUri: "${REDIRECT_URI:-}",
  scope: "${SCOPE:-}",
  apiBase: "${VITE_API_BASE:-http://localhost:3002}"
};
EOF

echo "Generated runtime config.js"
