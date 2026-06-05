#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash scripts/clear-annotations-mongo.sh [container_name] [--db <db_name>] [--project-id <project_id>] [--yes]
# Examples:
#   bash scripts/clear-annotations-mongo.sh
#   bash scripts/clear-annotations-mongo.sh ocra-mongodb --db ocra_content_test --yes
#   bash scripts/clear-annotations-mongo.sh --project-id cmabc123 --yes

container_name=""
db_name="${MONGO_CONTENT_DB:-ocra_content}"
project_id=""
auto_confirm=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      db_name="${2:-}"
      shift 2
      ;;
    --project-id)
      project_id="${2:-}"
      shift 2
      ;;
    --yes|-y)
      auto_confirm=true
      shift
      ;;
    --help|-h)
      sed -n '1,14p' "$0"
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -z "${container_name}" ]]; then
        container_name="$1"
        shift
      else
        echo "Unexpected positional argument: $1" >&2
        exit 1
      fi
      ;;
  esac
done

if [[ -z "${db_name}" ]]; then
  echo "Invalid db name" >&2
  exit 1
fi

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

echo "▶ Target container: ${container_name}"
echo "▶ Target database: ${db_name}"
if [[ -n "${project_id}" ]]; then
  echo "▶ Filter: projectId=${project_id}"
else
  echo "▶ Filter: ALL documents"
fi

if [[ "${auto_confirm}" != true ]]; then
  read -r -p "Proceed with deletion? [y/N] " answer
  if [[ ! "${answer}" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

until docker exec "${container_name}" mongosh --quiet --eval "db.adminCommand({ ping: 1 }).ok" >/dev/null 2>&1; do
  sleep 2
done

docker exec \
  -e MONGO_CONTENT_DB="${db_name}" \
  -e OCRA_PROJECT_ID="${project_id}" \
  -i "${container_name}" \
  mongosh --quiet <<'MONGO'
const dbName = process.env.MONGO_CONTENT_DB || 'ocra_content';
const projectId = (process.env.OCRA_PROJECT_ID || '').trim();

const contentDb = db.getSiblingDB(dbName);
const collections = ['annotation_geometry', 'annotation_data', 'annotation_link'];
const query = projectId ? { projectId } : {};

const summary = {};
for (const name of collections) {
  const collection = contentDb.getCollection(name);
  const before = collection.countDocuments(query);
  const result = collection.deleteMany(query);
  summary[name] = {
    before,
    deletedCount: result.deletedCount || 0,
  };
}

print(`Cleared annotation collections on DB: ${dbName}`);
if (projectId) {
  print(`Filter projectId: ${projectId}`);
} else {
  print('Filter projectId: <none> (all documents)');
}
for (const [name, info] of Object.entries(summary)) {
  print(`- ${name}: before=${info.before}, deleted=${info.deletedCount}`);
}
MONGO

echo "✅ Annotation collections cleanup completed."
