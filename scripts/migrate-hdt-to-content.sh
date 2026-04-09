#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_MIGRATION_SCRIPT="/tmp/ocra-migrate-hdt-to-content.js"

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

echo "▶ Ensuring MongoDB bootstrap exists in ${container_name} before migration..."
bash "${ROOT_DIR}/scripts/bootstrap-mongo.sh" "${container_name}"

echo "▶ Migrating ocra_audit.hdt_collection to ocra_content.hdt_collection in ${container_name}..."

until docker exec "${container_name}" mongosh --quiet --eval "db.adminCommand({ ping: 1 }).ok" >/dev/null 2>&1; do
  sleep 2
done

cat <<'EOF' | docker exec -i "${container_name}" sh -c "cat > '${TMP_MIGRATION_SCRIPT}'"
const sourceDb = db.getSiblingDB('ocra_audit');
const targetDb = db.getSiblingDB('ocra_content');

const source = sourceDb.getCollection('hdt_collection');
const target = targetDb.getCollection('hdt_collection');

const sourceDocs = source.find({}).toArray();

let copied = 0;
let updated = 0;
let unchanged = 0;

for (const doc of sourceDocs) {
  if (!doc.projectId) {
    print(`Skipping document without projectId: ${tojsononeline({ _id: doc._id })}`);
    continue;
  }

  const { _id, ...rest } = doc;

  const result = target.replaceOne(
    { projectId: doc.projectId },
    rest,
    { upsert: true }
  );

  if (result.upsertedCount > 0) {
    copied += 1;
  } else if (result.modifiedCount > 0) {
    updated += 1;
  } else {
    unchanged += 1;
  }
}

printjson({
  sourceCount: source.countDocuments(),
  targetCount: target.countDocuments(),
  copied,
  updated,
  unchanged,
});
EOF

docker exec "${container_name}" mongosh --quiet --file "${TMP_MIGRATION_SCRIPT}"
docker exec "${container_name}" rm -f "${TMP_MIGRATION_SCRIPT}"

echo "✅ HDT migration completed for ${container_name}."