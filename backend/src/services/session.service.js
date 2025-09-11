/**
 * Session Service
 * 
 * Business logic for session management operations
 */

import { 
  createUserSession as dbCreateUserSession,
  getValidSession as dbGetValidSession, 
  deleteSession as dbDeleteSession 
} from '../../db.js';

/**
 * Create a new user session
 */
export async function createSession(userProfile, tokens) {
  if (!userProfile?.sub || !tokens?.access_token) {
    throw new Error('Missing required fields: userProfile.sub or tokens.access_token');
  }

  return await dbCreateUserSession(userProfile, tokens);
}

/**
 * Get and validate a session
 */
export async function getSession(sessionId) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  const session = await dbGetValidSession(sessionId);
  
  if (!session) {
    return null;
  }

  // Return session without exposing sensitive tokens to frontend
  return {
    user: session.user,
    hasValidToken: !!session.accessToken
  };
}

/**
 * Delete a session
 */
export async function removeSession(sessionId) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  // Get user info before deletion for audit logging
  const session = await dbGetValidSession(sessionId);
  
  await dbDeleteSession(sessionId);
  
  return {
    userSub: session?.user.sub,
    success: true
  };
}
