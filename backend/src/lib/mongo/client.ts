import { Db, MongoClient } from 'mongodb';

let client: MongoClient | null = null;
let auditDb: Db | null = null;
let contentDb: Db | null = null;

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongodb:27017/?replicaSet=rs0';
const MONGO_AUDIT_DB = process.env.MONGO_AUDIT_DB || process.env.MONGO_DB || 'ocra_audit';
const MONGO_CONTENT_DB = process.env.MONGO_CONTENT_DB || 'ocra_content';

async function resetMongoClient() {
  if (client) {
    try {
      await client.close();
    } catch {
      // Ignore close errors while resetting a broken client.
    }
  }

  client = null;
  auditDb = null;
  contentDb = null;
}

export async function getMongoClient() {
  if (client) {
    try {
      await client.db('admin').command({ ping: 1 });
      return client;
    } catch {
      await resetMongoClient();
    }
  }

  client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  return client;
}

export async function getAuditDb() {
  const mongoClient = await getMongoClient();

  if (!auditDb) {
    auditDb = mongoClient.db(MONGO_AUDIT_DB);
  }

  return auditDb;
}

export async function getContentDb() {
  const mongoClient = await getMongoClient();

  if (!contentDb) {
    contentDb = mongoClient.db(MONGO_CONTENT_DB);
  }

  return contentDb;
}

export async function closeMongoClient() {
  await resetMongoClient();
}
