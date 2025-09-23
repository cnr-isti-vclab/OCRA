/**
 * DATABASE SERVICE (TypeScript version for backend)
 * 
 * This module provides database operations for storing OAuth sessions and user data.
 * It uses Prisma as the ORM to interact with PostgreSQL.
 */

import { PrismaClient } from '@prisma/client';
import { logEvent as mongoLogEvent } from './src/services/audit.service.js';
import { OAuthUserProfile, OAuthTokens } from './src/types/index.js';

// Type definitions for database operations
interface UserSelectData {
  sub: string;
  name: string | null;
  email: string;
  username: string | null;
  given_name: string | null;
  family_name: string | null;
}

interface LoginEventData {
  id: string;
  userSub: string;
  eventType: string;
  userAgent: string | null;
  ipAddress: string | null;
  success: boolean;
  sessionId: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

// Singleton Prisma client - reuse across the application
let prisma: PrismaClient | undefined;

/**
 * Get or create Prisma client instance
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
 */
export async function createUserSession(profile: OAuthUserProfile, tokens: OAuthTokens): Promise<string> {
  const db = getPrismaClient();
  
  // Calculate token expiration time
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  
  try {
    // Check if this email should be granted admin privileges
    const adminEmail = process.env.SYS_ADMIN_EMAIL?.toLowerCase().trim();
    const userEmail = (profile.email || '').toLowerCase().trim();
    const shouldBeAdmin = !!(adminEmail && userEmail && userEmail === adminEmail);
    
    // First check if a user with this sub already exists
    const existingUserBySub = await db.user.findUnique({
      where: { sub: profile.sub }
    });
    
    // If user exists by sub, update their information
    if (existingUserBySub) {
      const user = await db.user.update({
        where: { sub: profile.sub },
        data: {
          name: profile.name || null,
          email: profile.email || 'unknown@example.com',
          username: profile.username || profile.preferred_username || null,
          given_name: profile.given_name || null,
          family_name: profile.family_name || null,
          middle_name: profile.middle_name || null,
          // Grant admin privileges if email matches SYS_ADMIN_EMAIL (preserves existing admin status)
          ...(shouldBeAdmin && { sys_admin: true }),
          updatedAt: new Date(),
        },
      });
      
      // Log admin privilege grant if it happened
      if (shouldBeAdmin) {
        console.log(`🔐 Admin privileges granted to user: ${userEmail} (${user.sub})`);
      }
      
      // Create session and return
      const session = await db.session.create({
        data: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || null,
          idToken: tokens.id_token || null,
          expiresAt: expiresAt,
          userId: user.id,
        },
      });
      
      return session.id;
    }
    
    // Check if a user with this email already exists
    if (profile.email) {
      const existingUserByEmail = await db.user.findUnique({
        where: { email: profile.email }
      });
      
      if (existingUserByEmail) {
        // Reuse existing user - update their OAuth sub and other profile information
        console.log(`🔄 Reusing existing user with email: ${profile.email}, updating OAuth sub from ${existingUserByEmail.sub} to ${profile.sub}`);
        
        const user = await db.user.update({
          where: { email: profile.email },
          data: {
            sub: profile.sub, // Update the OAuth sub to the new one
            name: profile.name || existingUserByEmail.name,
            username: profile.username || profile.preferred_username || existingUserByEmail.username,
            given_name: profile.given_name || existingUserByEmail.given_name,
            family_name: profile.family_name || existingUserByEmail.family_name,
            middle_name: profile.middle_name || existingUserByEmail.middle_name,
            // Grant admin privileges if email matches SYS_ADMIN_EMAIL (preserves existing admin status)
            ...(shouldBeAdmin && { sys_admin: true }),
            updatedAt: new Date(),
          },
        });

        // Log admin privilege grant if it happened
        if (shouldBeAdmin) {
          console.log(`🔐 Admin privileges granted to existing user: ${userEmail} (${user.sub})`);
        }

        // Create session and return
        const session = await db.session.create({
          data: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            idToken: tokens.id_token || null,
            expiresAt: expiresAt,
            userId: user.id,
          },
        });
        
        return session.id;
      }
    }
    
    // Create new user (email and sub are both unique at this point)
    const user = await db.user.create({
      data: {
        sub: profile.sub,
        name: profile.name || null,
        email: profile.email || 'unknown@example.com',
        username: profile.username || profile.preferred_username || null,
        given_name: profile.given_name || null,
        family_name: profile.family_name || null,
        middle_name: profile.middle_name || null,
        sys_admin: shouldBeAdmin, // Grant admin on first login if email matches
      },
    });

    // Log admin privilege grant if it happened
    if (shouldBeAdmin) {
      console.log(`🔐 Admin privileges granted to user: ${userEmail} (${user.sub})`);
    }

    // Create session
    const session = await db.session.create({
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        idToken: tokens.id_token || null,
        expiresAt: expiresAt,
        userId: user.id, // Use the internal database ID, not the OAuth sub
      },
    });

    return session.id;
  } catch (error) {
    console.error('Failed to create user session:', error);
    throw new Error(`Database error: ${(error as Error).message}`);
  }
}

/**
 * Get a valid session by ID
 */
export async function getValidSession(sessionId: string) {
  const db = getPrismaClient();
  
  try {
    // findUnique cannot include additional filters; use findFirst with AND condition
    const session = await db.session.findFirst({
      where: {
        id: sessionId,
        expiresAt: { gt: new Date() },
      },
      include: { 
        user: true
      },
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
        username: session.user.username,
        given_name: session.user.given_name,
        family_name: session.user.family_name,
        middle_name: session.user.middle_name,
        sys_admin: session.user.sys_admin,
        sys_creator: session.user.sys_creator,
      },
    };
    
  } catch (error) {
    console.error('Failed to get session:', error);
    throw new Error(`Database error: ${(error as Error).message}`);
  }
}

/**
 * Delete a session (logout)
 */
export async function deleteUserSession(sessionId: string): Promise<boolean> {
  const db = getPrismaClient();
  
  try {
    await db.session.delete({
      where: { id: sessionId },
    });
    return true;
  } catch (error) {
    console.error('Failed to delete session:', error);
    return false;
  }
}

/**
 * Log a login event
 */
export async function logLoginEvent(
  userSub: string,
  eventType: string,
  success: boolean,
  userAgent: string | null,
  ipAddress: string | null,
  sessionId: string | null
): Promise<void> {
  const db = getPrismaClient();

  try {
    // Write login/logout events to MongoDB only. We may enrich the Mongo document
    // with the internal user id (read-only) for convenience, but we no longer
    // persist the same event in Postgres to avoid duplicate storage.
    const user = await db.user.findUnique({ where: { sub: userSub }, select: { id: true } }).catch(() => null);
    await mongoLogEvent({
      userSub,
      userId: user?.id || null,
      action: `login.${eventType}`,
      resource: null,
      success,
      ip: ipAddress,
      userAgent,
      payload: { sessionId }
    });
  } catch (err) {
    console.warn('Failed to write login/logout event to Mongo in logLoginEvent:', err instanceof Error ? err.message : err);
  }
}

/**
 * Unified audit writer (wrapper)
 * - If called with a login/logout shape, it delegates to logLoginEvent (which also dual-writes to Mongo)
 * - For generic audit events, it will attempt to write into Mongo via audit.service
 */
export async function logAuditEvent(event: any): Promise<void> {
  try {
    if (!event) return;
    // If it's a login/logout event shape, use existing Prisma writer which now dual-writes
    if (event.type === 'login' || event.type === 'logout' || event.eventType === 'login' || event.eventType === 'logout') {
      const userSub = event.userSub || event.sub || event.user?.sub;
      const eventType = event.eventType || event.type || (event.action && event.action.startsWith('login') ? 'login' : 'unknown');
      const success = typeof event.success === 'boolean' ? event.success : true;
      const userAgent = event.userAgent || event.user_agent || null;
      const ip = event.ip || event.ipAddress || null;
      const sessionId = event.payload?.sessionId || null;
      await logLoginEvent(userSub, eventType, success, userAgent, ip, sessionId);
      return;
    }
    // Otherwise, attempt to write into Mongo directly (best-effort)
    try {
      const { logEvent } = await import('./src/services/audit.service.js');
      await logEvent({
        userSub: event.userSub || event.sub || null,
        userId: event.userId || null,
        action: event.action || event.eventType || 'event',
        resource: event.resource || null,
        success: typeof event.success === 'boolean' ? event.success : true,
        ip: event.ip || null,
        userAgent: event.userAgent || null,
        payload: event.payload || null
      });
    } catch (err) {
      console.warn('Failed to write generic audit event to Mongo in logAuditEvent:', err instanceof Error ? err.message : err);
    }
  } catch (err) {
    console.error('logAuditEvent encountered an error:', err instanceof Error ? err.message : err);
  }
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers() {
  const db = getPrismaClient();
  
  try {
    const users = await db.user.findMany({
      select: {
        sub: true,
        name: true,
        email: true,
        username: true,
        given_name: true,
        family_name: true,
        middle_name: true,
        sys_admin: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    
    return users;
  } catch (error) {
    console.error('Failed to get all users:', error);
    throw new Error(`Database error: ${(error as Error).message}`);
  }
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string) {
  const db = getPrismaClient();
  
  try {
    const user = await db.user.findUnique({
      where: { sub: userId },
      select: {
        sub: true,
        name: true,
        email: true,
        username: true,
        given_name: true,
        family_name: true,
        middle_name: true,
        sys_admin: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    return user;
  } catch (error) {
    console.error('Failed to get user by ID:', error);
    throw new Error(`Database error: ${(error as Error).message}`);
  }
}

/**
 * Update user admin status
 */
export async function updateUserAdminStatus(userId: string, isAdmin: boolean) {
  const db = getPrismaClient();
  
  try {
    const user = await db.user.update({
      where: { sub: userId },
      data: { sys_admin: isAdmin },
      select: {
        sub: true,
        name: true,
        email: true,
        username: true,
        given_name: true,
        family_name: true,
        middle_name: true,
        sys_admin: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    return user;
  } catch (error) {
    console.error('Failed to update user admin status:', error);
    throw new Error(`Database error: ${(error as Error).message}`);
  }
}

/**
 * Get audit log (login events) with user information
 */
export async function getAuditLog() {
  // Prefer Mongo audit collection for read-side audit queries. Use the
  // audit.service helpers which already enrich documents with Prisma user info.
  try {
    const { getFullAuditLogFromMongo } = await import('./src/services/audit.service.js');
    const docs = await getFullAuditLogFromMongo(100);
    return docs;
  } catch (err) {
    console.error('Failed to get audit log from Mongo:', err instanceof Error ? err.message : err);
    throw new Error(`Audit read error: ${err instanceof Error ? err.message : String(err)}`);
  }
}