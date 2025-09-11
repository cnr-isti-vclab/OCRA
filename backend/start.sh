#!/bin/sh

# Exit on any error
set -e

echo "🔄 Syncing database schema..."
npx prisma db push --schema=./prisma/schema.prisma

echo "✅ Database schema synchronized"

echo "🌱 Seeding database with essential data..."
npx tsx seed.ts

echo "🚀 Starting the restructured backend server..."
exec npx tsx server.ts
