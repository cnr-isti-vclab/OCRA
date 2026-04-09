import { Collection, Document, Filter } from 'mongodb';
import { getAuditDb } from '../lib/mongo/client.js';

const MONGO_AUDIT_COLLECTION = process.env.MONGO_AUDIT_COLLECTION || process.env.MONGO_COLLECTION || 'audit';

let auditIndexesEnsured = false;

async function ensureAuditIndexes(collection: Collection<Document>) {
  if (auditIndexesEnsured) {
    return;
  }

  await collection.createIndex({ ts: -1 });
  await collection.createIndex({ userSub: 1, ts: -1 });
  await collection.createIndex({ 'resource.type': 1, 'resource.id': 1 });
  auditIndexesEnsured = true;
}

export async function getAuditCollection() {
  const db = await getAuditDb();
  const collection = db.collection(MONGO_AUDIT_COLLECTION);
  await ensureAuditIndexes(collection);
  return collection;
}

export async function aggregateLatestLoginDocs(limit: number) {
  const collection = await getAuditCollection();
  return collection.aggregate([
    { $match: { action: { $in: ['auth.login', 'login'] } } },
    { $match: { success: true } },
    { $sort: { ts: -1 } },
    { $group: { _id: '$userSub', createdAt: { $first: '$ts' } } },
    { $project: { userSub: '$_id', createdAt: 1, _id: 0 } },
    { $limit: limit }
  ]).toArray();
}

export async function findAuditDocs(filter: Filter<Document>, limit: number) {
  const collection = await getAuditCollection();
  return collection.find(filter).sort({ ts: -1 }).limit(limit).toArray();
}

export async function insertAuditDoc(doc: Document) {
  const collection = await getAuditCollection();
  return collection.insertOne(doc);
}
