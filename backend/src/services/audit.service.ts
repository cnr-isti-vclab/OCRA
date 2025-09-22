import { MongoClient, Db, Collection } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;
let col: Collection | null = null;

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongodb:27017';
const MONGO_DB = process.env.MONGO_DB || 'ocra_audit';
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || 'audit';

export async function connect() {
  if (client && db && col) return { client, db, col };
  client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db(MONGO_DB);
  col = db.collection(MONGO_COLLECTION);
  // Ensure indexes (ts descending for fast recent queries)
  await col.createIndex({ ts: -1 });
  await col.createIndex({ userSub: 1, ts: -1 });
  await col.createIndex({ 'resource.type': 1, 'resource.id': 1 });
  return { client, db, col };
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
  if (client) {
    await client.close();
    client = null;
    db = null;
    col = null;
  }
}

export default { logEvent, closeAuditConnection };
