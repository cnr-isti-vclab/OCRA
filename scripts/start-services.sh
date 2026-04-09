#!/usr/bin/env bash
set -euo pipefail

echo "▶ Starting local services (Postgres, Mongo, Keycloak)..."

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -q "^$1$"
}

container_running() {
  docker ps --format '{{.Names}}' | grep -q "^$1$"
}

published_host_port() {
  docker port "$1" "$2" 2>/dev/null || true
}

has_host_port() {
  local container_name="$1"
  local container_port="$2"
  local host_port="$3"
  local bindings

  bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "${container_name}")"
  [[ "${bindings}" == *"\"${container_port}\""* && "${bindings}" == *"\"HostPort\":\"${host_port}\""* ]]
}

container_env_contains() {
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" | grep -qx "$2"
}

running_container_on_host_port() {
  docker ps --format '{{.Names}}\t{{.Ports}}' | awk -v port=":$1->" '$0 ~ port {print $1}'
}

assert_port_available_for_container() {
  local container_name="$1"
  local host_port="$2"
  local label="$3"
  local owner

  owner="$(running_container_on_host_port "${host_port}" | grep -v "^${container_name}$" | head -n 1 || true)"
  if [[ -n "${owner}" ]]; then
    echo "❌ Cannot start ${label}: host port ${host_port} is already used by running container ${owner}." >&2
    echo "   Stop the conflicting container first (for example with 'docker compose down' or 'npm run services:stop')." >&2
    exit 1
  fi
}

ensure_started() {
  local container_name="$1"
  if container_running "${container_name}"; then
    echo "  - ${container_name} already running"
  else
    echo "  - Starting existing ${container_name}..."
    docker start "${container_name}" >/dev/null
  fi
}

POSTGRES_NAME="bare-ocra-postgres"
assert_port_available_for_container "${POSTGRES_NAME}" 5432 "bare PostgreSQL"

if container_exists "${POSTGRES_NAME}"; then
  recreate_postgres=0

  if ! has_host_port "${POSTGRES_NAME}" "5432/tcp" 5432; then
    echo "  - Recreating ${POSTGRES_NAME} with published port 5432..."
    recreate_postgres=1
  fi

  if ! container_env_contains "${POSTGRES_NAME}" "POSTGRES_USER=ocra_user" || \
     ! container_env_contains "${POSTGRES_NAME}" "POSTGRES_PASSWORD=ocra_pass" || \
     ! container_env_contains "${POSTGRES_NAME}" "POSTGRES_DB=ocra"; then
    echo "  - Recreating ${POSTGRES_NAME} with expected credentials..."
    recreate_postgres=1
  fi

  if [[ ${recreate_postgres} -eq 1 ]]; then
    docker rm -f "${POSTGRES_NAME}" >/dev/null 2>&1 || true
  fi
fi

if ! container_exists "${POSTGRES_NAME}"; then
  echo "  - Creating ${POSTGRES_NAME}..."
  docker run -d \
    --name "${POSTGRES_NAME}" \
    -e POSTGRES_USER=ocra_user \
    -e POSTGRES_PASSWORD=ocra_pass \
    -e POSTGRES_DB=ocra \
    -p 5432:5432 \
    -v ocra-postgres-data:/var/lib/postgresql/data \
    postgres:16 >/dev/null
else
  ensure_started "${POSTGRES_NAME}"
fi

MONGO_NAME="bare-ocra-mongo"
assert_port_available_for_container "${MONGO_NAME}" 27017 "bare MongoDB"

if container_exists "${MONGO_NAME}"; then
  recreate_mongo=0
  mongo_cmd="$(docker inspect --format '{{json .Config.Cmd}}' "${MONGO_NAME}")"

  if ! has_host_port "${MONGO_NAME}" "27017/tcp" 27017; then
    echo "  - Recreating ${MONGO_NAME} with published port 27017..."
    recreate_mongo=1
  fi

  if [[ "${mongo_cmd}" != *"--replSet"* || "${mongo_cmd}" != *"rs0"* ]]; then
    echo "  - Recreating ${MONGO_NAME} with replica set enabled..."
    recreate_mongo=1
  fi

  if [[ ${recreate_mongo} -eq 1 ]]; then
    docker rm -f "${MONGO_NAME}" >/dev/null 2>&1 || true
  fi
fi

if ! container_exists "${MONGO_NAME}"; then
  echo "  - Creating ${MONGO_NAME}..."
  docker run -d \
    --name "${MONGO_NAME}" \
    -p 27017:27017 \
    -v ocra-mongo-data:/data/db \
    mongo:7 \
    --replSet rs0 --bind_ip_all >/dev/null
else
  ensure_started "${MONGO_NAME}"
fi

echo "  - Bootstrapping MongoDB databases and collections..."
bash "$(dirname "$0")/bootstrap-mongo.sh" "${MONGO_NAME}"

KEYCLOAK_NAME="bare-keycloak"
assert_port_available_for_container "${KEYCLOAK_NAME}" 8081 "bare Keycloak"

if container_exists "${KEYCLOAK_NAME}"; then
  recreate_keycloak=0

  if ! has_host_port "${KEYCLOAK_NAME}" "8080/tcp" 8081; then
    echo "  - Recreating ${KEYCLOAK_NAME} with published port 8081..."
    recreate_keycloak=1
  fi

  if ! container_env_contains "${KEYCLOAK_NAME}" "KEYCLOAK_ADMIN=Administrator" || \
     ! container_env_contains "${KEYCLOAK_NAME}" "KEYCLOAK_ADMIN_PASSWORD=admin@ocra.it"; then
    echo "  - Recreating ${KEYCLOAK_NAME} with expected admin credentials..."
    recreate_keycloak=1
  fi

  if [[ ${recreate_keycloak} -eq 1 ]]; then
    docker rm -f "${KEYCLOAK_NAME}" >/dev/null 2>&1 || true
  fi
fi

if ! container_exists "${KEYCLOAK_NAME}"; then
  echo "  - Creating ${KEYCLOAK_NAME}..."
  docker run -d \
    --name "${KEYCLOAK_NAME}" \
    -p 8081:8080 \
    -e KEYCLOAK_ADMIN=Administrator \
    -e KEYCLOAK_ADMIN_PASSWORD=admin@ocra.it \
    -v keycloak-data:/opt/keycloak/data \
    quay.io/keycloak/keycloak:latest \
    start-dev >/dev/null
else
  ensure_started "${KEYCLOAK_NAME}"
fi

echo "✅ All services started (or already running)."
