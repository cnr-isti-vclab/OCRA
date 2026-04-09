import { ObjectId } from 'mongodb';
import { getContentDb } from '../lib/mongo/client.js';
import type { HDTDocument } from '../types/index.js';

const COLLECTION_NAME = 'hdt_collection';

let hdtIndexesEnsured = false;

async function ensureHdtIndexes() {
  if (hdtIndexesEnsured) {
    return;
  }

  const db = await getContentDb();
  const collection = db.collection<HDTDocument>(COLLECTION_NAME);
  await collection.createIndex({ projectId: 1 }, { unique: true });
  hdtIndexesEnsured = true;
}

export async function getHdtCollection() {
  const db = await getContentDb();
  await ensureHdtIndexes();
  return db.collection<HDTDocument>(COLLECTION_NAME);
}

export async function findHdtByProjectId(projectId: string) {
  const collection = await getHdtCollection();
  return collection.findOne({ projectId });
}

export async function insertHdtDocument(document: Omit<HDTDocument, '_id'>) {
  const collection = await getHdtCollection();
  return collection.insertOne(document as any);
}

export async function findHdtById(id: ObjectId) {
  const collection = await getHdtCollection();
  return collection.findOne({ _id: id });
}

export async function updateHdtByProjectId(projectId: string, update: any) {
  const collection = await getHdtCollection();
  return collection.findOneAndUpdate(
    { projectId },
    update,
    { returnDocument: 'after' }
  );
}

export async function deleteHdtByProjectId(projectId: string) {
  const collection = await getHdtCollection();
  return collection.deleteOne({ projectId });
}

export async function listHdtProjectIds() {
  const collection = await getHdtCollection();
  const cursor = collection.find({}, { projection: { projectId: 1 } });
  const results = await cursor.toArray();
  return results.map((doc: any) => doc.projectId as string);
}
