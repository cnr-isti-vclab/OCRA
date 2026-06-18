#!/bin/sh
# =============================================================================
# OCRA Backend Startup Script - Docker Container
# Handles database sync, seeding, and server startup
# =============================================================================

set -eu

echo "🚀 OCRA Backend container starting..."

wait_for_tcp_port() {
  host="$1"
  port="$2"
  label="$3"
  max_attempts="$4"
  attempt=1

  echo "⏳ Waiting for ${label} (${host}:${port})..."
  while [ "$attempt" -le "$max_attempts" ]; do
    if WAIT_HOST="$host" WAIT_PORT="$port" node -e "
const net = require('node:net');
const socket = net.createConnection({ host: process.env.WAIT_HOST, port: Number(process.env.WAIT_PORT) });
socket.setTimeout(2000);
socket.on('connect', () => { socket.end(); process.exit(0); });
socket.on('timeout', () => { socket.destroy(); process.exit(1); });
socket.on('error', () => process.exit(1));
" >/dev/null 2>&1; then
      echo "✅ ${label} ready"
      return 0
    fi

    echo "⏳ ${label} not ready (${attempt}/${max_attempts})..."
    attempt=$((attempt + 1))
    sleep 1
  done

  echo "❌ ${label} did not become ready in time." >&2
  exit 1
}

wait_for_oidc_discovery() {
  issuer="${ISSUER:-}"
  max_attempts=60
  attempt=1

  if [ -z "$issuer" ]; then
    echo "❌ ISSUER is not configured." >&2
    exit 1
  fi

  discovery_url="${issuer%/}/.well-known/openid-configuration"

  echo "⏳ Waiting for OIDC discovery (${discovery_url})..."
  while [ "$attempt" -le "$max_attempts" ]; do
    if DISCOVERY_URL="$discovery_url" node -e "fetch(process.env.DISCOVERY_URL).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"; then
      echo "✅ OIDC discovery ready"
      return 0
    fi

    echo "⏳ OIDC discovery not ready (${attempt}/${max_attempts})..."
    attempt=$((attempt + 1))
    sleep 2
  done

  echo "❌ OIDC discovery did not become ready in time." >&2
  echo "   URL: ${discovery_url}" >&2
  exit 1
}

# Wait for PostgreSQL (health check)
wait_for_tcp_port "postgres" "5432" "PostgreSQL" "30"
wait_for_oidc_discovery

# =============================================================================
# 1. DATABASE SCHEMA SYNC (idempotent, Prisma 5.18.0)
# =============================================================================
echo "🔄 Syncing database schema..."
npx prisma@5.18.0 db push --schema=./prisma/schema.prisma --accept-data-loss
echo "✅ Database schema synchronized"

# =============================================================================
# 2. SEEDING (only if NODE_ENV=development)
# =============================================================================
if [ "${NODE_ENV:-production}" = "development" ]; then
  echo "🌱 Seeding database with essential data..."
  if ! npx tsx seed.ts; then
    echo "⚠️  Seeding failed (non-blocking, continuing...)"
  fi
  echo "✅ Database seeded"
fi

# =============================================================================
# 3. PRISMA STUDIO (disabled in Docker/container - only local dev)
# =============================================================================
if [ "${NODE_ENV:-production}" = "development" ] && [ -z "${DOCKER_ENV:-}" ]; then
  echo "🟢 Starting Prisma Studio (port 5555)..."
  npx prisma@5.18.0 studio --schema=./prisma/schema.prisma --port 5555 &
  echo $! > /tmp/prisma_studio.pid
fi

# =============================================================================
# 4. SERVER STARTUP (replace process with server)
# =============================================================================
if [ "${NODE_ENV:-production}" = "production" ]; then
  echo "🚀 Starting production server (dist/server.js)"
  exec node ./dist/server.js
else
  echo "🚀 Starting development server (tsx watch)"
  exec npx tsx watch server.ts
fi
