#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST_PROJECT_FILES_DIR="${ROOT_DIR}/project_files"

dry_run=1
mode="both"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      dry_run=0
      ;;
    --compose-only)
      mode="compose"
      ;;
    --bare-only)
      mode="bare"
      ;;
    -h|--help)
      cat <<'EOF'
Usage: bash scripts/cleanup-orphan-project-files.sh [--apply]
       bash scripts/cleanup-orphan-project-files.sh [--apply] [--compose-only | --bare-only]

Runs a safe two-phase cleanup:
1. starts the Docker Compose data stack temporarily and cleans the compose project_files volume
2. tears compose down, starts the bare local data services temporarily, and cleans the host project_files directory

The script refuses to run if any OCRA compose or bare container is already running.
Default mode is dry-run. Pass --apply to actually delete orphan directories.

Options:
  --compose-only  Run only the compose cleanup branch.
  --bare-only     Run only the bare cleanup branch.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
  shift
done

declare -A compose_project_ids=()
declare -A bare_project_ids=()
declare -a compose_sources=()
declare -a bare_sources=()

compose_active=0
bare_active=0

container_running() {
  docker ps --format '{{.Names}}' | grep -q "^$1$"
}

container_exists() {
  docker ps -a --format '{{.Names}}' | grep -q "^$1$"
}

container_env_value() {
  local container_name="$1"
  local key="$2"

  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "${container_name}" |
    awk -F= -v key="${key}" '$1 == key { sub($1 "=", ""); print; exit }'
}

assert_no_running_ocra_containers() {
  local running=()
  local name

  for name in \
    ocra-postgres ocra-mongodb ocra-backend ocra-frontend ocra-keycloak \
    bare-ocra-postgres bare-ocra-mongo bare-keycloak; do
    if container_running "${name}"; then
      running+=("${name}")
    fi
  done

  if [[ ${#running[@]} -gt 0 ]]; then
    echo "Refusing to run while OCRA containers are already active: ${running[*]}" >&2
    echo "Stop them first, then re-run the cleanup script." >&2
    exit 1
  fi
}

wait_for_postgres() {
  local container_name="$1"
  local user db_name
  local attempt

  user="$(container_env_value "${container_name}" POSTGRES_USER)"
  db_name="$(container_env_value "${container_name}" POSTGRES_DB)"

  [[ -n "${user}" && -n "${db_name}" ]] || return 1

  for attempt in $(seq 1 60); do
    if docker exec "${container_name}" pg_isready -U "${user}" -d "${db_name}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for PostgreSQL in ${container_name}" >&2
  return 1
}

wait_for_mongo() {
  local container_name="$1"
  local attempt

  for attempt in $(seq 1 60); do
    if docker exec "${container_name}" mongosh --quiet --eval 'quit(db.adminCommand({ ping: 1 }).ok === 1 ? 0 : 1)' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for MongoDB in ${container_name}" >&2
  return 1
}

postgres_project_ids() {
  local container_name="$1"
  local db_name user password
  local table_exists

  db_name="$(container_env_value "${container_name}" POSTGRES_DB)"
  user="$(container_env_value "${container_name}" POSTGRES_USER)"
  password="$(container_env_value "${container_name}" POSTGRES_PASSWORD)"

  [[ -n "${db_name}" && -n "${user}" ]] || return 0

  table_exists="$(docker exec -e PGPASSWORD="${password}" "${container_name}" \
    psql -U "${user}" -d "${db_name}" -Atqc "SELECT to_regclass('public.projects')" 2>/dev/null || true)"

  [[ -n "${table_exists}" ]] || return 0

  docker exec -e PGPASSWORD="${password}" "${container_name}" \
    psql -U "${user}" -d "${db_name}" -Atqc 'SELECT id FROM projects' 2>/dev/null || true
}

mongo_project_ids() {
  local container_name="$1"

  docker exec "${container_name}" mongosh --quiet --eval '
    const database = db.getSiblingDB("ocra_content");
    const collections = ["hdt_collection", "annotation_geometry", "annotation_data", "annotation_link"];
    const seen = new Set();

    for (const collectionName of collections) {
      if (!database.getCollectionNames().includes(collectionName)) {
        continue;
      }

      for (const projectId of database.getCollection(collectionName).distinct("projectId")) {
        if (projectId && !seen.has(projectId)) {
          seen.add(projectId);
          print(projectId);
        }
      }
    }
  ' 2>/dev/null || true
}

register_project_ids() {
  local map_name="$1"
  local sources_name="$2"
  local source_name="$3"
  shift 3
  local found_any=0
  local project_id
  local -n target_map="${map_name}"
  local -n target_sources="${sources_name}"

  while IFS= read -r project_id; do
    [[ -n "${project_id}" ]] || continue
    target_map["${project_id}"]=1
    found_any=1
  done < <("$@")

  if [[ ${found_any} -eq 1 ]]; then
    target_sources+=("${source_name}")
  fi
}

cleanup_host_project_files() {
  local ids_name="$1"
  local orphan_count=0
  local dir_name
  local -n project_ids="${ids_name}"

  if [[ ! -d "${HOST_PROJECT_FILES_DIR}" ]]; then
    echo "Host project_files directory not found: ${HOST_PROJECT_FILES_DIR}"
    return 0
  fi

  while IFS= read -r dir_name; do
    [[ -n "${dir_name}" ]] || continue

    if [[ -n "${project_ids["${dir_name}"]+x}" ]]; then
      continue
    fi

    orphan_count=$((orphan_count + 1))

    if [[ ${dry_run} -eq 1 ]]; then
      echo "[dry-run] Would remove ${HOST_PROJECT_FILES_DIR}/${dir_name}"
    else
      if rm -rf -- "${HOST_PROJECT_FILES_DIR}/${dir_name}" 2>/dev/null; then
        echo "Removed ${HOST_PROJECT_FILES_DIR}/${dir_name}"
      else
        echo "Host delete failed for ${HOST_PROJECT_FILES_DIR}/${dir_name}; retrying via Docker helper..."
        docker run --rm -v "${HOST_PROJECT_FILES_DIR}:/project_files" alpine:3.20 rm -rf -- "/project_files/${dir_name}" >/dev/null
        echo "Removed ${HOST_PROJECT_FILES_DIR}/${dir_name} (via Docker helper)"
      fi
    fi
  done < <(
    for dir_path in "${HOST_PROJECT_FILES_DIR}"/*; do
      [[ -d "${dir_path}" ]] || continue
      basename "${dir_path}"
    done | sort
  )

  if [[ ${orphan_count} -eq 0 ]]; then
    echo "No orphan directories found in ${HOST_PROJECT_FILES_DIR}."
  fi
}

compose_project_files_volume() {
  docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/project_files"}}{{.Name}}{{end}}{{end}}' ocra-backend 2>/dev/null || true
}

cleanup_compose_project_files_volume() {
  local ids_name="$1"
  local volume_name
  local orphan_count=0
  local dir_name
  local -n project_ids="${ids_name}"

  volume_name="$(compose_project_files_volume)"
  if [[ -z "${volume_name}" ]]; then
    echo "Could not resolve the compose project_files volume; skipping compose volume cleanup."
    return 0
  fi

  while IFS= read -r dir_name; do
    [[ -n "${dir_name}" ]] || continue

    if [[ -n "${project_ids["${dir_name}"]+x}" ]]; then
      continue
    fi

    orphan_count=$((orphan_count + 1))

    if [[ ${dry_run} -eq 1 ]]; then
      echo "[dry-run] Would remove compose volume entry ${dir_name} from ${volume_name}"
    else
      docker run --rm -v "${volume_name}:/project_files" alpine:3.20 rm -rf -- "/project_files/${dir_name}" >/dev/null
      echo "Removed compose volume entry ${dir_name} from ${volume_name}"
    fi
  done < <(
    docker run --rm -v "${volume_name}:/project_files" alpine:3.20 sh -lc \
      'for dir_path in /project_files/*; do [ -d "$dir_path" ] || continue; basename "$dir_path"; done | sort'
  )

  if [[ ${orphan_count} -eq 0 ]]; then
    echo "No orphan directories found in compose volume ${volume_name}."
  fi
}

stop_compose_environment() {
  echo "▶ Tearing down compose data stack..."
  docker compose -f docker-compose.yml -f docker-compose.override.yml down >/dev/null 2>&1 || true
}

ensure_bare_postgres() {
  local container_name="bare-ocra-postgres"
  local recreate=0
  local env_dump

  if container_exists "${container_name}"; then
    env_dump="$(docker inspect --format '{{json .Config.Env}}' "${container_name}")"
    if [[ "${env_dump}" != *"POSTGRES_USER=ocra_user"* || \
          "${env_dump}" != *"POSTGRES_PASSWORD=ocra_pass"* || \
          "${env_dump}" != *"POSTGRES_DB=ocra"* ]]; then
      recreate=1
    fi

    if [[ ${recreate} -eq 1 ]]; then
      docker rm -f "${container_name}" >/dev/null 2>&1 || true
    fi
  fi

  if ! container_exists "${container_name}"; then
    docker run -d \
      --name "${container_name}" \
      -e POSTGRES_USER=ocra_user \
      -e POSTGRES_PASSWORD=ocra_pass \
      -e POSTGRES_DB=ocra \
      -p 5432:5432 \
      -v ocra-postgres-data:/var/lib/postgresql/data \
      postgres:16 >/dev/null
  else
    docker start "${container_name}" >/dev/null
  fi

  wait_for_postgres "${container_name}"
}

ensure_bare_mongo() {
  local container_name="bare-ocra-mongo"
  local recreate=0
  local mongo_cmd

  if container_exists "${container_name}"; then
    mongo_cmd="$(docker inspect --format '{{json .Config.Cmd}}' "${container_name}")"
    if [[ "${mongo_cmd}" != *"--replSet"* || "${mongo_cmd}" != *"rs0"* ]]; then
      recreate=1
    fi

    if [[ ${recreate} -eq 1 ]]; then
      docker rm -f "${container_name}" >/dev/null 2>&1 || true
    fi
  fi

  if ! container_exists "${container_name}"; then
    docker run -d \
      --name "${container_name}" \
      -p 27017:27017 \
      -v ocra-mongo-data:/data/db \
      mongo:7 \
      --replSet rs0 --bind_ip_all >/dev/null
  else
    docker start "${container_name}" >/dev/null
  fi

  wait_for_mongo "${container_name}"
  bash "${ROOT_DIR}/scripts/bootstrap-mongo.sh" "${container_name}" >/dev/null
}

stop_bare_environment() {
  echo "▶ Stopping bare data services..."
  docker stop bare-ocra-postgres >/dev/null 2>&1 || true
  docker stop bare-ocra-mongo >/dev/null 2>&1 || true
}

start_compose_environment() {
  echo "▶ Starting compose data stack temporarily..."
  docker compose -f docker-compose.yml -f docker-compose.override.yml up -d postgres mongodb backend >/dev/null
  wait_for_postgres ocra-postgres
  wait_for_mongo ocra-mongodb
}

start_bare_environment() {
  echo "▶ Starting bare data services temporarily..."
  ensure_bare_postgres
  ensure_bare_mongo
}

compose_cleanup() {
  echo "▶ Collecting compose project IDs and cleaning compose volume..."
  compose_project_ids=()
  compose_sources=()

  start_compose_environment
  compose_active=1

  register_project_ids compose_project_ids compose_sources "compose PostgreSQL" postgres_project_ids ocra-postgres
  register_project_ids compose_project_ids compose_sources "compose MongoDB" mongo_project_ids ocra-mongodb

  if [[ ${#compose_sources[@]} -gt 0 ]]; then
    echo "Using compose project IDs from: ${compose_sources[*]}"
  else
    echo "No compose project IDs found; compose cleanup will treat every directory as orphan."
  fi

  cleanup_compose_project_files_volume compose_project_ids
  stop_compose_environment
  compose_active=0
}

bare_cleanup() {
  echo "▶ Collecting bare project IDs and cleaning host filesystem..."
  bare_project_ids=()
  bare_sources=()

  start_bare_environment
  bare_active=1

  register_project_ids bare_project_ids bare_sources "bare PostgreSQL" postgres_project_ids bare-ocra-postgres
  register_project_ids bare_project_ids bare_sources "bare MongoDB" mongo_project_ids bare-ocra-mongo

  if [[ ${#bare_sources[@]} -gt 0 ]]; then
    echo "Using bare project IDs from: ${bare_sources[*]}"
  else
    echo "No bare project IDs found; host cleanup will treat every directory as orphan."
  fi

  cleanup_host_project_files bare_project_ids
  stop_bare_environment
  bare_active=0
}

cleanup_on_exit() {
  local exit_code=$?

  if [[ ${bare_active} -eq 1 ]]; then
    stop_bare_environment
  fi

  if [[ ${compose_active} -eq 1 ]]; then
    stop_compose_environment
  fi

  exit ${exit_code}
}

trap cleanup_on_exit EXIT

assert_no_running_ocra_containers

case "${mode}" in
  both)
    compose_cleanup
    bare_cleanup
    ;;
  compose)
    compose_cleanup
    ;;
  bare)
    bare_cleanup
    ;;
esac

if [[ ${dry_run} -eq 1 ]]; then
  echo "Dry-run completed. Re-run with --apply to delete orphan directories."
else
  echo "Cleanup completed."
fi
