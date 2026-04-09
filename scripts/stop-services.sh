#!/usr/bin/env bash
set -euo pipefail

echo "▶ Stopping local services (Postgres, Mongo, Keycloak)..."

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -q "^$1$"
}

container_running() {
  docker ps --format '{{.Names}}' | grep -q "^$1$"
}

stop_if_running() {
  local container_name="$1"
  local label="$2"

  if container_running "${container_name}"; then
    echo "  - Stopping ${label} (${container_name})..."
    docker stop "${container_name}" >/dev/null
  elif container_exists "${container_name}"; then
    echo "  - ${label} (${container_name}) is already stopped"
  else
    echo "  - ${label} (${container_name}) does not exist"
  fi
}

stop_if_running "bare-ocra-postgres" "bare PostgreSQL"
stop_if_running "bare-ocra-mongo" "bare MongoDB"
stop_if_running "bare-keycloak" "bare Keycloak"

compose_running=()
for name in "ocra-postgres" "ocra-mongodb" "ocra-keycloak" "ocra-backend" "ocra-frontend"; do
  if container_running "${name}"; then
    compose_running+=("${name}")
  fi
done

if [[ ${#compose_running[@]} -gt 0 ]]; then
  echo "⚠️  Docker Compose containers still running: ${compose_running[*]}"
  echo "   If you need to free ports 5432, 27017, 8081, 3001, or 3002, run 'docker compose down'."
fi

echo "✅ Bare local services stopped."
