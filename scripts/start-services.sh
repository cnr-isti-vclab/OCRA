#!/usr/bin/env bash
set -e

echo "▶ Starting local services (Postgres, Mongo, Keycloak)..."

# PostgreSQL
if docker ps -a --format '{{.Names}}' | grep -q '^ocra-postgres$'; then
  if ! docker ps --format '{{.Names}}' | grep -q '^ocra-postgres$'; then
    echo "  - Starting existing ocra-postgres..."
    docker start ocra-postgres >/dev/null
  else
    echo "  - ocra-postgres already running"
  fi
else
  echo "  - Creating ocra-postgres..."
  docker run -d \
    --name ocra-postgres \
    -e POSTGRES_USER=ocra_user \
    -e POSTGRES_PASSWORD=ocra_pass \
    -e POSTGRES_DB=ocra \
    -p 5432:5432 \
    -v ocra-postgres-data:/var/lib/postgresql/data \
    postgres:16
fi

# MongoDB
if docker ps -a --format '{{.Names}}' | grep -q '^ocra-mongo$'; then
  if ! docker ps --format '{{.Names}}' | grep -q '^ocra-mongo$'; then
    echo "  - Starting existing ocra-mongo..."
    docker start ocra-mongo >/dev/null
  else
    echo "  - ocra-mongo already running"
  fi
else
  echo "  - Creating ocra-mongo..."
  docker run -d \
    --name ocra-mongo \
    -p 27017:27017 \
    -v ocra-mongo-data:/data/db \
    mongo:7
fi

# Keycloak
if docker ps -a --format '{{.Names}}' | grep -q '^keycloak$'; then
  if ! docker ps --format '{{.Names}}' | grep -q '^keycloak$'; then
    echo "  - Starting existing keycloak..."
    docker start keycloak >/dev/null
  else
    echo "  - keycloak already running"
  fi
else
  echo "  - Creating keycloak..."
  docker run -d \
    --name keycloak \
    -p 8081:8080 \
    -e KEYCLOAK_ADMIN=Administrator \
    -e KEYCLOAK_ADMIN_PASSWORD=admin@ocra.it \
    -v keycloak-data:/opt/keycloak/data \
    quay.io/keycloak/keycloak:latest \
    start-dev
fi

echo "✅ All services started (or already running)."
