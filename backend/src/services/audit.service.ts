import { MongoClient, Db, Collection } from 'mongodb';

let client: MongoClient | null = null;
let auditDb: Db | null = null;
let auditCollection: Collection | null = null;
let contentDb: Db | null = null;

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongodb:27017';
const MONGO_AUDIT_DB = process.env.MONGO_AUDIT_DB || process.env.MONGO_DB || 'ocra_audit';
const MONGO_AUDIT_COLLECTION = process.env.MONGO_AUDIT_COLLECTION || process.env.MONGO_COLLECTION || 'audit';
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
  auditCollection = null;
  contentDb = null;
}

async function getMongoClient() {
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

export async function connect() {
  const mongoClient = await getMongoClient();

  if (!auditDb) {
    auditDb = mongoClient.db(MONGO_AUDIT_DB);
  }

  if (!auditCollection) {
    auditCollection = auditDb.collection(MONGO_AUDIT_COLLECTION);
    // Ensure indexes (ts descending for fast recent queries)
    await auditCollection.createIndex({ ts: -1 });
    await auditCollection.createIndex({ userSub: 1, ts: -1 });
    await auditCollection.createIndex({ 'resource.type': 1, 'resource.id': 1 });
  }

  return { client: mongoClient, db: auditDb, col: auditCollection };
}

export async function connectContent() {
  const mongoClient = await getMongoClient();

  if (!contentDb) {
    contentDb = mongoClient.db(MONGO_CONTENT_DB);
  }

  return { client: mongoClient, db: contentDb };
}

export async function getCollection() {
  const res = await connect();
  return res.col;
}

export async function getLatestLogins(limit = 100) {
  const col = await getCollection();
  if (!col) return [];
  const pipeline = [
    { $match: { action: { $in: ['auth.login', 'login'] } } },
    { $match: { success: true } },
    { $sort: { ts: -1 } },
    { $group: { _id: '$userSub', createdAt: { $first: '$ts' } } },
    { $project: { userSub: '$_id', createdAt: 1, _id: 0 } },
    { $limit: limit }
  ];
  const docs = await col.aggregate(pipeline).toArray();
  return docs.map((d: any) => ({ userSub: d.userSub as string, createdAt: d.createdAt as Date }));
}

/**
 * Enrich raw Mongo audit docs with Prisma user info and normalize shape
 */
export async function enrichAuditDocs(docs: any[]) {
  if (!docs || docs.length === 0) return [];
  const subs = Array.from(new Set(docs.map((d: any) => d.userSub).filter((s: any): s is string => typeof s === 'string')));
  let users: any[] = [];
  try {
    const { getPrismaClient } = await import('../../db.js');
    const prisma = getPrismaClient();
    if (subs.length > 0) {
      users = await prisma.user.findMany({ where: { sub: { in: subs as string[] } }, select: { sub: true, name: true, email: true, username: true, given_name: true, family_name: true } });
    }
  } catch (err) {
    console.warn('Failed to enrich audit docs with Prisma users:', err instanceof Error ? err.message : err);
    users = [];
  }
  const userMap = new Map(users.map((u: any) => [u.sub, u]));
  return docs.map((doc: any) => {
    const u = userMap.get(doc.userSub) as any | undefined;
    return {
      id: doc.eventId || doc._id?.toString(),
      eventType: doc.action || doc.eventType || 'unknown',
      success: typeof doc.success === 'boolean' ? doc.success : true,
      userAgent: doc.userAgent || doc.user_agent || null,
      createdAt: doc.ts || doc.createdAt || null,
      errorMessage: doc.errorMessage || (doc.payload && doc.payload.error) || null,
      userSub: doc.userSub || null,
      user: u ? {
        sub: u.sub,
        name: u.name,
        email: u.email,
        username: u.username,
        displayName: u.name || `${u.given_name || ''} ${u.family_name || ''}`.trim() || u.username || 'Unknown User'
      } : null,
      resource: doc.resource || null,
      payload: doc.payload || null
    };
  });
}

export async function getUserAuditLogFromMongo(userSub: string, limit = 20) {
  try {
    const col = await getCollection();
    if (!col) return [];
    const docs = await col.find({ userSub }).sort({ ts: -1 }).limit(limit).toArray();
    return await enrichAuditDocs(docs);
  } catch (err) {
    console.error('Failed to read audit events from Mongo:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getFullAuditLogFromMongo(limit = 50) {
  try {
    const col = await getCollection();
    if (!col) return [];
    const docs = await col.find({}).sort({ ts: -1 }).limit(Math.min(100, limit)).toArray();
    return await enrichAuditDocs(docs);
  } catch (err) {
    console.error('Failed to read full audit from Mongo:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function logEvent(event: any) {
  try {
    const col = await getCollection();
    const doc = {
      eventId: event.eventId || (globalThis as any).crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      ts: event.ts || new Date(),
      userSub: event.userSub || null,
      userId: event.userId || null,
      action: event.action || 'unknown',
      resource: event.resource || null,
      success: typeof event.success === 'boolean' ? event.success : true,
      ip: event.ip || null,
      userAgent: event.userAgent || null,
      payload: event.payload || null
    };
    await col.insertOne(doc);
  } catch (err) {
    console.error('Failed to log audit event:', err instanceof Error ? err.message : err);
  }
}

export async function closeAuditConnection() {
  await resetMongoClient();
}

export default { logEvent, closeAuditConnection };
