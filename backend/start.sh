#!/bin/sh

#
# BACKEND CONTAINER STARTUP SCRIPT
#
# This script is executed automatically when the backend Docker container starts.
# It runs as the main command (CMD) defined in the Dockerfile.
#
# EXECUTION TIMELINE:
# 1. docker-compose up backend (or docker-compose up)
# 2. PostgreSQL container starts first (dependency)
# 3. Backend container builds (if needed) and starts
# 4. This script executes inside the container at /app/backend
# 5. Database schema sync → Database seeding → Server startup
#
# The script ensures the database is properly initialized before accepting connections.
#

# Exit on any error
set -e

echo "🔄 Syncing database schema..."
npx prisma db push --schema=./prisma/schema.prisma

echo "✅ Database schema synchronized"

echo "🚀 Starting the restructured backend server..."
echo "🌱 Seeding database with essential data..."
npx tsx seed.ts

echo "🟢 Starting Prisma Studio in background..."
npx prisma studio --schema=./prisma/schema.prisma --port 5555 &

echo "🚀 Starting the restructured backend server..."
exec npx tsx server.ts
