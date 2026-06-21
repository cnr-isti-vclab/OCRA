const replicaSetName = process.env.MONGO_REPLICA_SET_NAME || 'rs0';
const replicaHost = process.env.MONGO_REPLICA_HOST || 'mongodb:27017';

/**
 * Ensures the replica set is initialised and healthy.
 *
 * Three cases handled:
 *  1. Fresh volume  — rs.status() throws NotYetInitialized → rs.initiate()
 *  2. Stale hostname in stored config (e.g. "mongodb:27017" → "127.0.0.1:27017")
 *     — rs.reconfig({ force: true }) so the node can recognise itself and become primary.
 *  3. Already correct — no-op, just wait for isWritablePrimary.
 */
function ensureReplicaSet() {
  let needsInit = false;
  let currentConfig = null;

  try {
    rs.status();
    // Replica set exists in some state; read its config.
    currentConfig = rs.conf();
  } catch (err) {
    const msg = String(err?.codeName || err?.message || err);

    if (msg.includes('NotYetInitialized')) {
      needsInit = true;
    } else if (
      msg.includes('NotPrimaryOrSecondary') ||
      msg.includes('AlreadyInitialized') ||
      msg.includes('REMOVED')
    ) {
      // Replica set exists but node is in a bad state (REMOVED / not-yet-primary).
      // Try to read the on-disk config so we can reconfig if the host is wrong.
      try {
        currentConfig = rs.conf();
      } catch (_) {
        // Config unreadable; attempt a forced initiate below.
        needsInit = true;
      }
    } else {
      throw err;
    }
  }

  if (needsInit) {
    rs.initiate({ _id: replicaSetName, members: [{ _id: 0, host: replicaHost }] });
    print(`Replica set initiated: ${replicaSetName} (${replicaHost})`);
  } else if (currentConfig) {
    const storedHost = currentConfig.members[0].host;
    if (storedHost !== replicaHost) {
      // Stored hostname no longer resolves — update it so mongod can find itself.
      currentConfig.members[0].host = replicaHost;
      currentConfig.version += 1;
      rs.reconfig(currentConfig, { force: true });
      print(`Replica set host updated: ${storedHost} → ${replicaHost}`);
    }
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const hello = db.hello();
    if (hello?.setName === replicaSetName && hello?.isWritablePrimary) {
      print(`Replica set ready: ${replicaSetName} (${replicaHost})`);
      return;
    }
    sleep(1000);
  }

  throw new Error(`Replica set ${replicaSetName} did not become writable within 30 s`);
}

ensureReplicaSet();

const auditDb = db.getSiblingDB('ocra_audit');
const contentDb = db.getSiblingDB('ocra_content');

function ensureCollection(database, name) {
  const existingCollections = database.getCollectionNames();
  if (!existingCollections.includes(name)) {
    void database.createCollection(name);
  }
}

function dropIndexIfExists(collection, name) {
  const indexes = collection.getIndexes();
  if (Object.prototype.hasOwnProperty.call(indexes, name)) {
    void collection.dropIndex(name);
  }
}

ensureCollection(auditDb, 'audit');

ensureCollection(contentDb, 'hdt_collection');
ensureCollection(contentDb, 'annotation_geometry');
ensureCollection(contentDb, 'annotation_data');
ensureCollection(contentDb, 'annotation_link');

dropIndexIfExists(contentDb.annotation_link, 'projectId_1_annotationGeometry_1_annotationData_1');
dropIndexIfExists(contentDb.annotation_link, 'projectId_1_annotationGeometry_1');
dropIndexIfExists(contentDb.annotation_link, 'projectId_1_annotationData_1');

void contentDb.annotation_geometry.createIndex({ projectId: 1, id: 1 }, { unique: true });
void contentDb.annotation_geometry.createIndex({ projectId: 1, referenceType: 1, referenceId: 1 });
void contentDb.annotation_geometry.createIndex({ projectId: 1, erasableAt: 1 });
void contentDb.annotation_geometry.createIndex({ projectId: 1, createdAt: 1 });
void contentDb.annotation_geometry.createIndex({ projectId: 1, updatedAt: 1 });

void contentDb.annotation_data.createIndex({ projectId: 1, id: 1 }, { unique: true });
void contentDb.annotation_data.createIndex({ projectId: 1, visibilityType: 1, visibilityId: 1 });
void contentDb.annotation_data.createIndex({ projectId: 1, erasableAt: 1 });
void contentDb.annotation_data.createIndex({ projectId: 1, createdAt: 1 });
void contentDb.annotation_data.createIndex({ projectId: 1, updatedAt: 1 });

void contentDb.annotation_link.createIndex({ projectId: 1, id: 1 }, { unique: true });
void contentDb.annotation_link.createIndex(
  { projectId: 1, geometryId: 1, dataId: 1 },
  { unique: true }
);
void contentDb.annotation_link.createIndex({ projectId: 1, geometryId: 1 });
void contentDb.annotation_link.createIndex({ projectId: 1, dataId: 1 });
void contentDb.annotation_link.createIndex({ projectId: 1, erasableAt: 1 });
void contentDb.annotation_link.createIndex({ projectId: 1, createdAt: 1 });

void contentDb.hdt_collection.createIndex({ projectId: 1 }, { unique: true });

print(`Initialized MongoDB databases: ocra_audit, ocra_content`);
