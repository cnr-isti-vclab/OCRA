#!/bin/sh

# Exit on any error
set -e

echo "🔄 Syncing database schema..."
npx prisma db push --schema=./prisma/schema.prisma

echo "✅ Database schema synchronized"

echo "🌱 Seeding database with essential data..."
node seed.js

echo "🚀 Starting the restructured backend server..."
exec node server.js
