/**
 * Session Service
 * 
 * Business logic for session management operations
 */

import { 
  createUserSession as dbCreateUserSession,
  getValidSession as dbGetValidSession, 
  deleteUserSession as dbDeleteUserSession 
} from '../../db.js';
import { OAuthUserProfile, OAuthTokens } from '../types/index.js';

/**
 * Create a new user session
 */
export async function createSession(userProfile: OAuthUserProfile, tokens: OAuthTokens): Promise<string> {
  if (!userProfile?.sub || !tokens?.access_token) {
    throw new Error('Missing required fields: userProfile.sub or tokens.access_token');
  }

  try {
    const sessionId = await dbCreateUserSession(userProfile, tokens);
    
    if (!sessionId) {
      throw new Error('Failed to create session');
    }
    
    return sessionId;
  } catch (error) {
    console.error('Session service error:', error);
    throw new Error(`Session creation failed: ${(error as Error).message}`);
  }
}

/**
 * Get session data by ID
 */
export async function getSession(sessionId: string) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  try {
    const session = await dbGetValidSession(sessionId);
    
    if (!session) {
      return null;
    }

    // Return session with limited data
    return {
      user: session.user,
      hasValidToken: !!session.accessToken
    };
  } catch (error) {
    console.error('Session retrieval error:', error);
    throw new Error(`Session retrieval failed: ${(error as Error).message}`);
  }
}

/**
 * Remove session (logout)
 */
export async function removeSession(sessionId: string): Promise<boolean> {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  try {
    return await dbDeleteUserSession(sessionId);
  } catch (error) {
    console.error('Session removal error:', error);
    throw new Error(`Session removal failed: ${(error as Error).message}`);
  }
}