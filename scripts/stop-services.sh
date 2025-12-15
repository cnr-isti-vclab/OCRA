#!/usr/bin/env bash
set -e

echo "▶ Stopping local services (Postgres, Mongo, Keycloak)..."

for NAME in "bare-ocra-postgres" "bare-ocra-mongo" "bare-keycloak"; do
  if docker ps --format '{{.Names}}' | grep -q "^${NAME}$"; then
    echo "  - Stopping ${NAME}..."
    docker stop ${NAME} >/dev/null
  else
    echo "  - ${NAME} is not running"
  fi
done

echo "✅ All services stopped."
