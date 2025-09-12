/**
 * DATABASE SERVICE (TypeScript version for backend)
 * 
 * This module provides database operations for storing OAuth sessions and user data.
 * It uses Prisma as the ORM to interact with PostgreSQL.
 */

import { PrismaClient } from '@prisma/client';
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
    await db.loginEvent.create({
      data: {
        userSub,
        eventType,
        success,
        userAgent,
        ipAddress,
        sessionId,
      },
    });
  } catch (error) {
    console.error('Failed to log login event:', error);
    // Don't throw error for logging failures
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
  const db = getPrismaClient();
  
  try {
    const events = await db.loginEvent.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 100, // Limit to last 100 events
    });
    
    // Get all unique user subs from events
    const userSubs = [...new Set(events.map((event: LoginEventData) => event.userSub))];
    
    // Fetch user information for all users in the audit log
    const users = await db.user.findMany({
      where: {
        sub: {
          in: userSubs
        }
      },
      select: {
        sub: true,
        name: true,
        email: true,
        username: true,
        given_name: true,
        family_name: true
      }
    });
    
    // Create a map of userSub to user info for quick lookup
    const userMap = new Map(users.map((user: UserSelectData) => [user.sub, user]));
    
    // Enrich events with user information
    const enrichedEvents = events.map((event: LoginEventData) => {
      const user = userMap.get(event.userSub) as UserSelectData | undefined;
      return {
        ...event,
        user: user ? {
          sub: user.sub,
          name: user.name,
          email: user.email,
          username: user.username,
          displayName: user.name || 
                       `${user.given_name || ''} ${user.family_name || ''}`.trim() ||
                       user.username ||
                       'Unknown User'
        } : null
      };
    });
    
    return enrichedEvents;
  } catch (error) {
    console.error('Failed to get audit log:', error);
    throw new Error(`Database error: ${(error as Error).message}`);
  }
}