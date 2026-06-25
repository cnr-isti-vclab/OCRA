import { ObjectId } from 'mongodb';
import type { UpdateFilter } from 'mongodb';
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
  await collection.createIndex({ 'echoesContext.digitalTwinUri': 1 }, { sparse: true });
  await collection.createIndex({ 'echoesContext.namedGraphUri': 1 }, { sparse: true });
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
  return collection.insertOne(document as HDTDocument);
}

export async function findHdtById(id: ObjectId) {
  const collection = await getHdtCollection();
  return collection.findOne({ _id: id });
}

export async function updateHdtByProjectId(projectId: string, update: UpdateFilter<HDTDocument>) {
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
  const results = await collection.find({}, { projection: { projectId: 1 } }).toArray();
  return results.map((doc) => doc.projectId);
}
