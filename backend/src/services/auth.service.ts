/**
 * Auth Service
 * 
 * Business logic for authentication and audit operations
 */

import { logLoginEvent, getAuditLog } from '../../db.js';

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
  return await logLoginEvent(userSub, 'login', success, userAgent, ipAddress, sessionId);
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
  return await logLoginEvent(userSub, 'logout', true, userAgent, ipAddress, sessionId);
}

/**
 * Get user's audit log
 */
export async function getUserAuditLog(userSub: string, limit: number = 20) {
  if (!userSub) {
    throw new Error('User subject is required');
  }
  
  // Get all audit events and filter for this user
  const allEvents = await getAuditLog();
  return allEvents
    .filter((event: any) => event.userSub === userSub)
    .slice(0, limit);
}

/**
 * Get full audit log (admin only)
 */
export async function getFullAuditLog() {
  return await getAuditLog();
}

/**
 * Test user info by access token (debug function)
 */
export async function testUserInfo(accessToken: string) {
  // This is a debug function that would normally call Keycloak's userinfo endpoint
  // For now, return a placeholder response
  return {
    message: 'This is a debug endpoint',
    accessToken: accessToken.substring(0, 20) + '...',
    note: 'In a real implementation, this would validate the token with Keycloak'
  };
}