#!/bin/sh
# =============================================================================
# OCRA Backend Startup Script - Docker Container
# Handles database sync, seeding, and server startup
# =============================================================================

set -eu

echo "🚀 OCRA Backend container starting..."

# Wait for PostgreSQL (health check)
echo "⏳ Waiting for PostgreSQL (postgres:5432)..."
for i in {1..30}; do
  if nc -z postgres 5432 >/dev/null 2>&1; then
    echo "✅ PostgreSQL ready"
    break
  fi
  echo "⏳ PostgreSQL not ready ($i/30)..."
  sleep 1
done

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
