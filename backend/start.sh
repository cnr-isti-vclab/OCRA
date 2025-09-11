#!/bin/sh

# Exit on any error
set -e

echo "🔄 Running Prisma migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "✅ Migrations completed successfully"

echo "🚀 Starting the restructured backend server..."
exec node server-new.js
