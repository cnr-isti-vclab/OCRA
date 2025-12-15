#!/usr/bin/env bash
set -e

echo "▶ Starting local services (Postgres, Mongo, Keycloak)..."

# PostgreSQL (bare metal)
POSTGRES_NAME="bare-ocra-postgres"
if docker ps -a --format '{{.Names}}' | grep -q "^${POSTGRES_NAME}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${POSTGRES_NAME}$"; then
    echo "  - Starting existing ${POSTGRES_NAME}..."
    docker start ${POSTGRES_NAME} >/dev/null
  else
    echo "  - ${POSTGRES_NAME} already running"
  fi
else
  echo "  - Creating ${POSTGRES_NAME}..."
  docker run -d \
    --name ${POSTGRES_NAME} \
    -e POSTGRES_USER=ocra_user \
    -e POSTGRES_PASSWORD=ocra_pass \
    -e POSTGRES_DB=ocra \
    -p 5432:5432 \
    -v ocra-postgres-data:/var/lib/postgresql/data \
    postgres:16
fi

# MongoDB (bare metal)
MONGO_NAME="bare-ocra-mongo"
if docker ps -a --format '{{.Names}}' | grep -q "^${MONGO_NAME}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${MONGO_NAME}$"; then
    echo "  - Starting existing ${MONGO_NAME}..."
    docker start ${MONGO_NAME} >/dev/null
  else
    echo "  - ${MONGO_NAME} already running"
  fi
else
  echo "  - Creating ${MONGO_NAME}..."
  docker run -d \
    --name ${MONGO_NAME} \
    -p 27017:27017 \
    -v ocra-mongo-data:/data/db \
    mongo:7
fi

# Keycloak (bare metal) 
KEYCLOAK_NAME="bare-keycloak"
if docker ps -a --format '{{.Names}}' | grep -q "^${KEYCLOAK_NAME}$"; then
  if ! docker ps --format '{{.Names}}' | grep -q "^${KEYCLOAK_NAME}$"; then
    echo "  - Starting existing ${KEYCLOAK_NAME}..."
    docker start ${KEYCLOAK_NAME} >/dev/null
  else
    echo "  - ${KEYCLOAK_NAME} already running"
  fi
else
  echo "  - Creating ${KEYCLOAK_NAME}..."
  docker run -d \
    --name ${KEYCLOAK_NAME} \
    -p 8081:8080 \
    -e KEYCLOAK_ADMIN=Administrator \
    -e KEYCLOAK_ADMIN_PASSWORD=admin@ocra.it \
    -v keycloak-data:/opt/keycloak/data \
    quay.io/keycloak/keycloak:latest \
    start-dev
fi

echo "✅ All services started (or already running)."
