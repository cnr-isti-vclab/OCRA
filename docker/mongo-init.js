const replicaSetName = process.env.MONGO_REPLICA_SET_NAME || 'rs0';
const replicaHost = process.env.MONGO_REPLICA_HOST || 'mongodb:27017';

function ensureReplicaSet() {
  let initialized = false;

  try {
    const status = rs.status();
    initialized = status?.ok === 1;
  } catch (error) {
    const message = error?.codeName || error?.message || String(error);
    if (!String(message).includes('NotYetInitialized')) {
      throw error;
    }
  }

  if (!initialized) {
    rs.initiate({
      _id: replicaSetName,
      members: [{ _id: 0, host: replicaHost }]
    });
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const hello = db.hello();
    if (hello?.setName === replicaSetName && hello?.isWritablePrimary) {
      print(`Replica set ready: ${replicaSetName} (${replicaHost})`);
      return;
    }
    sleep(1000);
  }

  throw new Error(`Replica set ${replicaSetName} did not become writable in time`);
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

ensureCollection(auditDb, 'audit');

ensureCollection(contentDb, 'hdt_collection');
ensureCollection(contentDb, 'annotation_geometry');
ensureCollection(contentDb, 'annotation_data');
ensureCollection(contentDb, 'annotation_link');

void contentDb.annotation_geometry.createIndex({ projectId: 1, id: 1 }, { unique: true });
void contentDb.annotation_geometry.createIndex({ projectId: 1, referenceType: 1, referenceId: 1 });
void contentDb.annotation_geometry.createIndex({ projectId: 1, erasableAt: 1 });

void contentDb.annotation_data.createIndex({ projectId: 1, id: 1 }, { unique: true });
void contentDb.annotation_data.createIndex({ projectId: 1, visibilityType: 1, visibilityId: 1 });
void contentDb.annotation_data.createIndex({ projectId: 1, erasableAt: 1 });

void contentDb.annotation_link.createIndex({ projectId: 1, id: 1 }, { unique: true });
void contentDb.annotation_link.createIndex(
  { projectId: 1, geometryId: 1, dataId: 1 },
  { unique: true }
);
void contentDb.annotation_link.createIndex({ projectId: 1, geometryId: 1 });
void contentDb.annotation_link.createIndex({ projectId: 1, dataId: 1 });
void contentDb.annotation_link.createIndex({ projectId: 1, erasableAt: 1 });

void contentDb.hdt_collection.createIndex({ projectId: 1 }, { unique: true });

print(`Initialized MongoDB replica set ${replicaSetName} with databases: ocra_audit, ocra_content`);