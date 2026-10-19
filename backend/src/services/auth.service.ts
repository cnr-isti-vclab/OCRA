/**
 * Auth Service
 * 
 * Business logic for authentication and audit operations
 */

import { logAuditEvent } from '../../db.js';

/**
 * Log a login event
 */
export async function logLogin(
  userSub: string, 
  success: boolean, 
  userAgent: string | null, 
  ipAddress: string | null, 
  sessionId: string | null
): Promise<void> {
  return await logAuditEvent({ userSub, eventType: 'login', type: 'login', success, userAgent, ipAddress, payload: { sessionId } });
}

/**
 * Log a logout event
 */
export async function logLogout(
  userSub: string, 
  sessionId: string | null, 
  userAgent: string | null, 
  ipAddress: string | null
): Promise<void> {
  return await logAuditEvent({ userSub, eventType: 'logout', type: 'logout', success: true, userAgent, ipAddress, payload: { sessionId } });
}

/**
 * Get user's audit log
 */
export async function getUserAuditLog(userSub: string, limit: number = 20) {
  if (!userSub) {
    throw new Error('User subject is required');
  }
  return await (await import('./audit.service.js')).getUserAuditLogFromMongo(userSub, limit);
}

/**
 * Get full audit log (admin only)
 */
export async function getFullAuditLog(limit: number = 50) {
  // Prefer Mongo for full audit log
  return await (await import('./audit.service.js')).getFullAuditLogFromMongo(limit);
}
