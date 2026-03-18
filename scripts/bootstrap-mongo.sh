#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INIT_SCRIPT="${ROOT_DIR}/docker/mongo-init.js"
TMP_INIT_SCRIPT="/tmp/ocra-mongo-init.js"

if [[ ! -f "${INIT_SCRIPT}" ]]; then
  echo "Mongo init script not found: ${INIT_SCRIPT}" >&2
  exit 1
fi

container_name="${1:-}"

if [[ -z "${container_name}" ]]; then
  if docker ps --format '{{.Names}}' | grep -q '^bare-ocra-mongo$'; then
    container_name="bare-ocra-mongo"
  elif docker ps --format '{{.Names}}' | grep -q '^ocra-mongodb$'; then
    container_name="ocra-mongodb"
  else
    echo "No running MongoDB container found. Pass the container name explicitly." >&2
    exit 1
  fi
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${container_name}$"; then
  echo "MongoDB container is not running: ${container_name}" >&2
  exit 1
fi

echo "▶ Ensuring MongoDB databases and collections in ${container_name}..."

until docker exec "${container_name}" mongosh --quiet --eval "db.adminCommand({ ping: 1 }).ok" >/dev/null 2>&1; do
  sleep 2
done

docker cp "${INIT_SCRIPT}" "${container_name}:${TMP_INIT_SCRIPT}"
docker exec "${container_name}" mongosh --quiet --file "${TMP_INIT_SCRIPT}"
docker exec "${container_name}" rm -f "${TMP_INIT_SCRIPT}"

echo "✅ MongoDB bootstrap completed for ${container_name}."