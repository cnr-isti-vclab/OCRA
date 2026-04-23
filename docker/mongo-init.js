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

void contentDb.annotation_data.createIndex({ projectId: 1, id: 1 }, { unique: true });
void contentDb.annotation_data.createIndex({ projectId: 1, privateToScene: 1 });

void contentDb.annotation_link.createIndex({ projectId: 1, id: 1 }, { unique: true });
void contentDb.annotation_link.createIndex(
  { projectId: 1, geometryId: 1, dataId: 1 },
  { unique: true }
);
void contentDb.annotation_link.createIndex({ projectId: 1, geometryId: 1 });
void contentDb.annotation_link.createIndex({ projectId: 1, dataId: 1 });

void contentDb.hdt_collection.createIndex({ projectId: 1 }, { unique: true });

print('Initialized MongoDB databases: ocra_audit, ocra_content');