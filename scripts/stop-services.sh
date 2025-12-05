#!/usr/bin/env bash
set -e

echo "▶ Stopping local services (Postgres, Mongo, Keycloak)..."

for NAME in keycloak ocra-postgres ocra-mongo; do
  if docker ps --format '{{.Names}}' | grep -q "^${NAME}$"; then
    echo "  - Stopping ${NAME}..."
    docker stop "${NAME}" >/dev/null
  else
    echo "  - ${NAME} is not running"
  fi
done

echo "✅ Services stopped."
