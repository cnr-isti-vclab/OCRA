#!/usr/bin/env sh
set -eu

# Generate /usr/share/nginx/html/config.js from env vars if provided
cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  issuer: "${ISSUER:-}",
  clientId: "${CLIENT_ID:-}",
  redirectUri: "${REDIRECT_URI:-}",
  scope: "${SCOPE:-}",
  apiBase: "${VITE_API_BASE:-http://localhost:3002}",
  showEccchDebugOperations: ${SHOW_ECCCH_DEBUG_OPERATIONS:-false},
  showThreePresenterDebug: ${THREE_PRESENTER_DEBUG:-true}
};
EOF

echo "Generated runtime config.js"
