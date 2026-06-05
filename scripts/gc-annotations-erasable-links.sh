#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash scripts/gc-annotations-erasable-links.sh [container_name] [--db <db_name>] [--project-id <project_id>] [--yes]
# Examples:
#   bash scripts/gc-annotations-erasable-links.sh --yes
#   bash scripts/gc-annotations-erasable-links.sh ocra-mongodb --db ocra_content_test --yes
#   bash scripts/gc-annotations-erasable-links.sh --project-id cmabc123 --yes

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
  echo "▶ Filter: ALL projects"
fi

if [[ "${auto_confirm}" != true ]]; then
  read -r -p "Proceed with erasable annotations GC? [y/N] " answer
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
const geometryCollection = contentDb.getCollection('annotation_geometry');
const dataCollection = contentDb.getCollection('annotation_data');
const linkCollection = contentDb.getCollection('annotation_link');

const scopeFilter = projectId ? { projectId } : {};
const erasableFilter = { ...scopeFilter, erasableAt: { $ne: null } };

function findGeometryIdsToDelete() {
  const pipeline = [
    { $match: erasableFilter },
    {
      $lookup: {
        from: 'annotation_link',
        let: { geometryId: '$id', projectId: '$projectId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$geometryId', '$$geometryId'] },
                  { $eq: ['$projectId', '$$projectId'] },
                ],
              },
            },
          },
          { $project: { erasableAt: 1 } },
        ],
        as: 'links',
      },
    },
    {
      $addFields: {
        totalLinks: { $size: '$links' },
        erasableLinks: {
          $size: {
            $filter: {
              input: '$links',
              as: 'link',
              cond: { $ne: ['$$link.erasableAt', null] },
            },
          },
        },
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ['$totalLinks', 0] },
            { $eq: ['$totalLinks', '$erasableLinks'] },
          ],
        },
      },
    },
    { $project: { _id: 0, id: 1 } },
  ];

  return geometryCollection.aggregate(pipeline).toArray().map((doc) => doc.id);
}

function findDataIdsToDelete() {
  const pipeline = [
    { $match: erasableFilter },
    {
      $lookup: {
        from: 'annotation_link',
        let: { dataId: '$id', projectId: '$projectId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$dataId', '$$dataId'] },
                  { $eq: ['$projectId', '$$projectId'] },
                ],
              },
            },
          },
          { $project: { erasableAt: 1 } },
        ],
        as: 'links',
      },
    },
    {
      $addFields: {
        totalLinks: { $size: '$links' },
        erasableLinks: {
          $size: {
            $filter: {
              input: '$links',
              as: 'link',
              cond: { $ne: ['$$link.erasableAt', null] },
            },
          },
        },
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ['$totalLinks', 0] },
            { $eq: ['$totalLinks', '$erasableLinks'] },
          ],
        },
      },
    },
    { $project: { _id: 0, id: 1 } },
  ];

  return dataCollection.aggregate(pipeline).toArray().map((doc) => doc.id);
}

const erasableLinksBefore = linkCollection.countDocuments(erasableFilter);
const erasableGeometryCandidates = geometryCollection.countDocuments(erasableFilter);
const erasableDataCandidates = dataCollection.countDocuments(erasableFilter);

const geometryIdsToDelete = findGeometryIdsToDelete();
const dataIdsToDelete = findDataIdsToDelete();

let deletedGeometryCount = 0;
let deletedDataCount = 0;

if (geometryIdsToDelete.length > 0) {
  const geometryDeleteResult = geometryCollection.deleteMany({
    ...erasableFilter,
    id: { $in: geometryIdsToDelete },
  });
  deletedGeometryCount = geometryDeleteResult.deletedCount || 0;
}

if (dataIdsToDelete.length > 0) {
  const dataDeleteResult = dataCollection.deleteMany({
    ...erasableFilter,
    id: { $in: dataIdsToDelete },
  });
  deletedDataCount = dataDeleteResult.deletedCount || 0;
}

const linkDeleteResult = linkCollection.deleteMany(erasableFilter);

print(`Annotation erasable-link GC completed on DB: ${dbName}`);
if (projectId) {
  print(`Filter projectId: ${projectId}`);
} else {
  print('Filter projectId: <none> (all projects)');
}
print(`- annotation_geometry erasable candidates=${erasableGeometryCandidates}, deleted=${deletedGeometryCount}`);
print(`- annotation_data erasable candidates=${erasableDataCandidates}, deleted=${deletedDataCount}`);
print(`- annotation_link erasable before=${erasableLinksBefore}, deleted=${linkDeleteResult.deletedCount || 0}`);
MONGO

echo "✅ Erasable annotations GC completed."
