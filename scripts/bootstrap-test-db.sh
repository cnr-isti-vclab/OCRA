#!/usr/bin/env bash
set -euo pipefail

POSTGRES_ADMIN_HOST="${POSTGRES_ADMIN_HOST:-localhost}"
POSTGRES_ADMIN_PORT="${POSTGRES_ADMIN_PORT:-5432}"
POSTGRES_ADMIN_USER="${POSTGRES_ADMIN_USER:-postgres}"
POSTGRES_ADMIN_DB="${POSTGRES_ADMIN_DB:-postgres}"
POSTGRES_ADMIN_PASSWORD="${POSTGRES_ADMIN_PASSWORD:-${PGPASSWORD:-postgres}}"

TEST_DB_ROLE="${TEST_DB_ROLE:-ocra_user}"
TEST_DB_PASSWORD="${TEST_DB_PASSWORD:-ocra_pass}"
TEST_DB_NAME="${TEST_DB_NAME:-ocra_test}"

export PGPASSWORD="${POSTGRES_ADMIN_PASSWORD}"

psql_base=(
  psql
  -h "${POSTGRES_ADMIN_HOST}"
  -p "${POSTGRES_ADMIN_PORT}"
  -U "${POSTGRES_ADMIN_USER}"
  -d "${POSTGRES_ADMIN_DB}"
  -v ON_ERROR_STOP=1
)

"${psql_base[@]}" <<SQL
DO \
\$\$\
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TEST_DB_ROLE}') THEN
    CREATE ROLE ${TEST_DB_ROLE} LOGIN PASSWORD '${TEST_DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

if ! "${psql_base[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'" | grep -q 1; then
  "${psql_base[@]}" -c "CREATE DATABASE ${TEST_DB_NAME} OWNER ${TEST_DB_ROLE};"
fi

echo "✅ Test role ${TEST_DB_ROLE} and database ${TEST_DB_NAME} are ready"