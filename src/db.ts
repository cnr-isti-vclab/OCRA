/**
 * DATABASE SERVICE
 * 
 * This module provides database operations for storing OAuth sessions and user data.
 * It uses Prisma as the ORM to interact with PostgreSQL.
 * 
 * Key concepts:
 * - Prisma Client: Type-safe database client generated from schema
 * - Sessions: Store OAuth tokens with expiration
 * - Users: Store user profile information from OAuth provider
 * - Audit logging: Track login events for security
 */

import { PrismaClient } from './generated/prisma';
import type { OAuthTokens, UserProfile } from './types';

// Singleton Prisma client - reuse across the application
let prisma: PrismaClient;

/**
 * Get or create Prisma client instance
 * In development, this prevents exhausting database connections
 * due to hot reloading creating new clients
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
  }
  return prisma;
}

/**
 * Store or update user profile and create a new session
 * This is called after successful OAuth token exchange
 */
export async function createUserSession(
  profile: UserProfile,
  tokens: OAuthTokens
): Promise<string> {
  const db = getPrismaClient();
  
  // Calculate token expiration time
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  
  try {
    // Upsert user (create if doesn't exist, update if exists)
    const user = await db.user.upsert({
      where: { sub: profile.sub },
      update: {
        email: profile.email,
        name: profile.name,
        updatedAt: new Date(),
      },
      create: {
        sub: profile.sub,
        email: profile.email,
        name: profile.name,
      },
    });

    // Create new session
    const session = await db.session.create({
      data: {
        userId: user.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
        expiresAt,
      },
    });

    return session.id;
  } catch (error) {
    console.error('Failed to create user session:', error);
    throw error;
  }
}

/**
 * Get valid session and user data
 * Returns null if session doesn't exist or is expired
 */
export async function getValidSession(sessionId: string) {
  const db = getPrismaClient();
  
  try {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    // Check if session exists and is not expired
    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    return {
      sessionId: session.id,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: session.user.id,
        sub: session.user.sub,
        email: session.user.email,
        name: session.user.name,
      },
    };
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const db = getPrismaClient();
  
  try {
    await db.session.delete({
      where: { id: sessionId },
    });
  } catch (error) {
    console.error('Failed to delete session:', error);
    // Don't throw - logout should always succeed from user perspective
  }
}

/**
 * Clean up expired sessions (can be called periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const db = getPrismaClient();
  
  try {
    const result = await db.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
    
    console.log(`Cleaned up ${result.count} expired sessions`);
    return result.count;
  } catch (error) {
    console.error('Failed to cleanup sessions:', error);
    return 0;
  }
}

/**
 * Log login/logout attempt for audit purposes
 */
export async function logLoginEvent(
  userSub: string,
  success: boolean,
  userAgent?: string,
  ipAddress?: string,
  eventType: 'login' | 'logout' = 'login',
  sessionId?: string,
  errorMessage?: string
): Promise<void> {
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
  } catch (error) {
    console.error(`Failed to log ${eventType} event:`, error);
    // Don't throw - logging failure shouldn't break login/logout
  }
}

/**
 * Log logout event for audit purposes
 */
export async function logLogoutEvent(
  userSub: string,
  sessionId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<void> {
  return logLoginEvent(userSub, true, userAgent, ipAddress, 'logout', sessionId);
}

/**
 * Get user's login history
 */
export async function getUserLoginHistory(userSub: string, limit = 10) {
  const db = getPrismaClient();
  
  try {
    return await db.loginEvent.findMany({
      where: { userSub },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    console.error('Failed to get login history:', error);
    return [];
  }
}
