/**
 * Auth Service
 * 
 * Business logic for authentication and audit operations
 */

import { 
  logLoginEvent as dbLogLoginEvent,
  logLogoutEvent as dbLogLogoutEvent,
  getUserLoginHistory as dbGetUserLoginHistory 
} from '../../db.js';

/**
 * Log a login event
 */
export async function logLogin(userSub, success, userAgent, ipAddress, sessionId, errorMessage) {
  return await dbLogLoginEvent(
    userSub,
    success,
    userAgent,
    ipAddress,
    'login',
    sessionId,
    errorMessage
  );
}

/**
 * Log a logout event
 */
export async function logLogout(userSub, sessionId, userAgent, ipAddress) {
  return await dbLogLogoutEvent(userSub, sessionId, userAgent, ipAddress);
}

/**
 * Get user's audit log
 */
export async function getUserAuditLog(userSub, limit = 20) {
  if (!userSub) {
    throw new Error('User subject is required');
  }

  return await dbGetUserLoginHistory(userSub, limit);
}

/**
 * Test userinfo endpoint from OAuth provider
 */
export async function testUserInfo(accessToken) {
  if (!accessToken) {
    throw new Error('Access token is required');
  }

  const response = await fetch('http://keycloak:8080/realms/demo/protocol/openid-connect/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Userinfo request failed: ${response.status}`);
  }

  const userinfo = await response.json();

  return {
    status: 'success',
    userinfo: userinfo,
    availableFields: Object.keys(userinfo),
    standardNameFields: {
      given_name: userinfo.given_name || 'NOT_AVAILABLE',
      family_name: userinfo.family_name || 'NOT_AVAILABLE', 
      middle_name: userinfo.middle_name || 'NOT_AVAILABLE'
    }
  };
}
