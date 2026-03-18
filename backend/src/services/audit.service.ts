import { getAuditDb, getContentDb, getMongoClient, closeMongoClient } from '../lib/mongo/client.js';
import { aggregateLatestLoginDocs, findAuditDocs, getAuditCollection, insertAuditDoc } from '../repositories/audit.repository.js';

export async function connect() {
  const [mongoClient, auditDb, auditCollection] = await Promise.all([
    getMongoClient(),
    getAuditDb(),
    getAuditCollection()
  ]);

  return { client: mongoClient, db: auditDb, col: auditCollection };
}

export async function connectContent() {
  const [mongoClient, contentDb] = await Promise.all([
    getMongoClient(),
    getContentDb()
  ]);

  return { client: mongoClient, db: contentDb };
}

export async function getCollection() {
  return getAuditCollection();
}

export async function getLatestLogins(limit = 100) {
  const docs = await aggregateLatestLoginDocs(limit);
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
    const docs = await findAuditDocs({ userSub }, limit);
    return await enrichAuditDocs(docs);
  } catch (err) {
    console.error('Failed to read audit events from Mongo:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getFullAuditLogFromMongo(limit = 50) {
  try {
    const docs = await findAuditDocs({}, Math.min(100, limit));
    return await enrichAuditDocs(docs);
  } catch (err) {
    console.error('Failed to read full audit from Mongo:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function logEvent(event: any) {
  try {
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
    await insertAuditDoc(doc);
  } catch (err) {
    console.error('Failed to log audit event:', err instanceof Error ? err.message : err);
  }
}

export async function closeAuditConnection() {
  await closeMongoClient();
}

export default { logEvent, closeAuditConnection };
