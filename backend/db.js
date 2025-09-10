/**
 * DATABASE SERVICE (JavaScript version for backend)
 * 
 * This module provides database operations for storing OAuth sessions and user data.
 * It uses Prisma as the ORM to interact with PostgreSQL.
 */

import { PrismaClient } from '@prisma/client';

// Singleton Prisma client - reuse across the application
let prisma;

/**
 * Get or create Prisma client instance
 */
export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }
  return prisma;
}

/**
 * Store or update user profile and create a new session
 */
export async function createUserSession(profile, tokens) {
  const db = getPrismaClient();
  
  // Calculate token expiration time
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  
  try {
    // Upsert user (create if doesn't exist, update if exists)
    const user = await db.user.upsert({
      where: { sub: profile.sub },
      update: {
        name: profile.name,
        email: profile.email,
        updatedAt: new Date(),
      },
      create: {
        sub: profile.sub,
        name: profile.name,
        email: profile.email,
      },
    });
    
    // Create new session
    const session = await db.session.create({
      data: {
        userId: user.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
        expiresAt: expiresAt,
      },
    });
    
    console.log(`✅ Created session ${session.id} for user ${user.sub}`);
    return session.id;
    
  } catch (error) {
    console.error('Failed to create user session:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

/**
 * Get a valid session with user data
 */
export async function getValidSession(sessionId) {
  const db = getPrismaClient();
  
  try {
    // findUnique cannot include additional filters; use findFirst with AND condition
    const session = await db.session.findFirst({
      where: {
        id: sessionId,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
    
    if (!session) {
      return null;
    }
    
    return {
      id: session.id,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      idToken: session.idToken,
      expiresAt: session.expiresAt,
      user: {
        sub: session.user.sub,
        name: session.user.name,
        email: session.user.email,
      },
    };
    
  } catch (error) {
    console.error('Failed to get session:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(sessionId) {
  const db = getPrismaClient();
  
  try {
    await db.session.delete({
      where: { id: sessionId },
    });
    
    console.log(`✅ Deleted session ${sessionId}`);
    
  } catch (error) {
    // Session might not exist, that's okay
    console.warn('Session deletion failed (may not exist):', error.message);
  }
}

/**
 * Log a login event for audit purposes
 */
export async function logLoginEvent(
  userSub,
  success,
  userAgent = '',
  ipAddress = '',
  eventType = 'login',
  sessionId = null,
  errorMessage = null
) {
  const db = getPrismaClient();
  
  try {
    await db.loginEvent.create({
      data: {
  userSub,
        eventType,
        success,
        userAgent,
        ipAddress,
        sessionId,
        errorMessage,
      },
    });
    
    console.log(`📝 Logged ${eventType} event for user ${userSub}: ${success ? 'success' : 'failed'}`);
    
  } catch (error) {
    console.error('Failed to log login event:', error);
    // Don't throw - logging failures shouldn't break the main flow
  }
}

/**
 * Log a logout event
 */
export async function logLogoutEvent(userSub, sessionId, userAgent = '', ipAddress = '') {
  return logLoginEvent(userSub, true, userAgent, ipAddress, 'logout', sessionId);
}

/**
 * Get user's login history for audit purposes
 */
export async function getUserLoginHistory(userSub, limit = 20) {
  const db = getPrismaClient();
  
  try {
    // Find user by sub
    const user = await db.user.findUnique({
      where: { sub: userSub },
    });
    
    if (!user) {
      return [];
    }
    
    const events = await db.loginEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    
    return events.map(event => ({
      id: event.id,
      eventType: event.eventType,
      success: event.success,
      timestamp: event.createdAt,
      userAgent: event.userAgent,
      ipAddress: event.ipAddress,
      sessionId: event.sessionId,
      errorMessage: event.errorMessage,
    }));
    
  } catch (error) {
    console.error('Failed to get login history:', error);
    throw new Error(`Database error: ${error.message}`);
  }
}

/**
 * Debug function to list all sessions
 */
export async function debugListAllSessions() {
  const db = getPrismaClient();
  
  try {
    const sessions = await db.session.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    
    console.log('📊 All sessions:', sessions.map(s => ({
      id: s.id,
      user: s.user.sub,
      expiresAt: s.expiresAt,
      expired: s.expiresAt < new Date(),
    })));
    
    return sessions;
  } catch (error) {
    console.error('Failed to list sessions:', error);
    return [];
  }
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions() {
  const db = getPrismaClient();
  
  try {
    const result = await db.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    
    console.log(`🧹 Cleaned up ${result.count} expired sessions`);
    return result.count;
    
  } catch (error) {
    console.error('Failed to cleanup expired sessions:', error);
    return 0;
  }
}
