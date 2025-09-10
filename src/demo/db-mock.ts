/**
 * BROWSER-COMPATIBLE DATABASE SIMULATION
 * 
 * Since this is a frontend-only demo and Prisma Client requires Node.js,
 * this file provides a browser-compatible simulation of database operations
 * using localStorage as a mock database.
 * 
 * In a real application, these operations would:
 * 1. Be implemented in a backend API server
 * 2. Use the actual Prisma client to connect to PostgreSQL
 * 3. Provide REST or GraphQL endpoints for the frontend
 * 
 * This simulation demonstrates the data flow and security model
 * without requiring a full backend setup for the demo.
 */

import type { OAuthTokens, UserProfile } from '../types';

// Simulate database storage using localStorage
const DB_PREFIX = 'oauth_demo_db_';

interface DbUser {
  id: string;
  sub: string;
  email: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

interface DbSession {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

interface DbLoginEvent {
  id: string;
  userSub: string;
  eventType: 'login' | 'logout';  // Added event type
  userAgent?: string;
  ipAddress?: string;
  success: boolean;
  sessionId?: string;  // Added session ID reference
  errorMessage?: string;  // Added error details
  createdAt: string;
}

// Generate a simple ID (in real app, use cuid() or similar)
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Get data from localStorage "database"
function getStorageData<T>(key: string): T[] {
  const data = localStorage.getItem(DB_PREFIX + key);
  return data ? JSON.parse(data) : [];
}

// Set data to localStorage "database"
function setStorageData<T>(key: string, data: T[]): void {
  localStorage.setItem(DB_PREFIX + key, JSON.stringify(data));
}

/**
 * Store or update user profile and create a new session
 * This is called after successful OAuth token exchange
 */
export async function createUserSession(
  profile: UserProfile,
  tokens: OAuthTokens
): Promise<string> {
  
  console.log('🔧 [DEMO] Creating user session in localStorage database simulation');
  
  // Calculate token expiration time
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  
  try {
    // Get existing users
    const users = getStorageData<DbUser>('users');
    
    // Find or create user
    let user = users.find(u => u.sub === profile.sub);
    const now = new Date().toISOString();
    
    if (user) {
      // Update existing user
      user.email = profile.email;
      user.name = profile.name;
      user.updatedAt = now;
    } else {
      // Create new user
      user = {
        id: generateId(),
        sub: profile.sub,
        email: profile.email,
        name: profile.name,
        createdAt: now,
        updatedAt: now,
      };
      users.push(user);
    }
    
    // Save updated users
    setStorageData('users', users);

    // Create new session
    const session: DbSession = {
      id: generateId(),
      userId: user.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    // Save session
    const sessions = getStorageData<DbSession>('sessions');
    sessions.push(session);
    setStorageData('sessions', sessions);

    console.log('✅ [DEMO] Session created successfully:', { sessionId: session.id, userId: user.id });
    return session.id;
  } catch (error) {
    console.error('❌ [DEMO] Failed to create user session:', error);
    throw error;
  }
}

/**
 * Get valid session and user data
 * Returns null if session doesn't exist or is expired
 */
export async function getValidSession(sessionId: string) {
  console.log('🔧 [DEMO] Getting session from localStorage database simulation:', sessionId);
  
  try {
    const sessions = getStorageData<DbSession>('sessions');
    const session = sessions.find(s => s.id === sessionId);

    // Check if session exists and is not expired
    if (!session || new Date(session.expiresAt) < new Date()) {
      console.log('❌ [DEMO] Session not found or expired');
      return null;
    }

    // Get user data
    const users = getStorageData<DbUser>('users');
    const user = users.find(u => u.id === session.userId);
    
    if (!user) {
      console.log('❌ [DEMO] User not found for session');
      return null;
    }

    console.log('✅ [DEMO] Valid session found:', { sessionId, userId: user.id });
    
    return {
      sessionId: session.id,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: {
        id: user.id,
        sub: user.sub,
        email: user.email,
        name: user.name,
      },
    };
  } catch (error) {
    console.error('❌ [DEMO] Failed to get session:', error);
    return null;
  }
}

/**
 * Delete a session (logout)
 */
export async function deleteSession(sessionId: string): Promise<void> {
  console.log('🔧 [DEMO] Deleting session from localStorage database simulation:', sessionId);
  
  try {
    const sessions = getStorageData<DbSession>('sessions');
    const filteredSessions = sessions.filter(s => s.id !== sessionId);
    setStorageData('sessions', filteredSessions);
    
    console.log('✅ [DEMO] Session deleted successfully');
  } catch (error) {
    console.error('❌ [DEMO] Failed to delete session:', error);
    // Don't throw - logout should always succeed from user perspective
  }
}

/**
 * Clean up expired sessions (can be called periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  console.log('🔧 [DEMO] Cleaning up expired sessions');
  
  try {
    const sessions = getStorageData<DbSession>('sessions');
    const now = new Date();
    const validSessions = sessions.filter(s => new Date(s.expiresAt) >= now);
    const deletedCount = sessions.length - validSessions.length;
    
    setStorageData('sessions', validSessions);
    
    console.log(`✅ [DEMO] Cleaned up ${deletedCount} expired sessions`);
    return deletedCount;
  } catch (error) {
    console.error('❌ [DEMO] Failed to cleanup sessions:', error);
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
  console.log('🔧 [DEMO] Logging login/logout event:', { userSub, success, eventType });
  
  try {
    const loginEvent: DbLoginEvent = {
      id: generateId(),
      userSub,
      eventType,
      success,
      userAgent,
      ipAddress,
      sessionId,
      errorMessage,
      createdAt: new Date().toISOString(),
    };

    const loginEvents = getStorageData<DbLoginEvent>('loginEvents');
    loginEvents.push(loginEvent);
    setStorageData('loginEvents', loginEvents);
    
    console.log(`✅ [DEMO] ${eventType} event logged successfully`);
  } catch (error) {
    console.error(`❌ [DEMO] Failed to log ${eventType} event:`, error);
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
  console.log('🔧 [DEMO] Getting login history for user:', userSub);
  
  try {
    const loginEvents = getStorageData<DbLoginEvent>('loginEvents');
    const userEvents = loginEvents
      .filter(event => event.userSub === userSub)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
      
    console.log(`✅ [DEMO] Found ${userEvents.length} login events`);
    return userEvents;
  } catch (error) {
    console.error('❌ [DEMO] Failed to get login history:', error);
    return [];
  }
}

// Debug function to view all data in the "database"
export function debugViewDatabase() {
  console.log('📊 [DEMO] Database contents:');
  console.log('Users:', getStorageData<DbUser>('users'));
  console.log('Sessions:', getStorageData<DbSession>('sessions'));
  console.log('Login Events:', getStorageData<DbLoginEvent>('loginEvents'));
}

// Debug function to clear all data
export function debugClearDatabase() {
  localStorage.removeItem(DB_PREFIX + 'users');
  localStorage.removeItem(DB_PREFIX + 'sessions');
  localStorage.removeItem(DB_PREFIX + 'loginEvents');
  console.log('🗑️ [DEMO] Database cleared');
}

// Debug function to view recent audit events
export function debugViewAuditLog(limit = 10) {
  const events = getStorageData<DbLoginEvent>('loginEvents')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
  
  console.log(`📋 [DEMO] Recent ${limit} audit events:`);
  console.table(events.map(e => ({
    eventType: e.eventType,
    success: e.success,
    userSub: e.userSub.substring(0, 8) + '...',
    time: new Date(e.createdAt).toLocaleString(),
    error: e.errorMessage || '—'
  })));
  
  return events;
}

// Expose debug functions to window for easy testing
if (typeof window !== 'undefined') {
  (window as any).debugViewDatabase = debugViewDatabase;
  (window as any).debugClearDatabase = debugClearDatabase;
  (window as any).debugViewAuditLog = debugViewAuditLog;
  console.log('🔧 [DEMO] Debug functions available: debugViewDatabase(), debugClearDatabase(), debugViewAuditLog()');
  
  // Add some demo audit events if database is empty (first time setup)
  const existingEvents = getStorageData<DbLoginEvent>('loginEvents');
  if (existingEvents.length === 0) {
    const demoEvents: DbLoginEvent[] = [
      {
        id: generateId(),
        userSub: 'demo-user-12345',
        eventType: 'login',
        success: false,
        userAgent: 'Mozilla/5.0 (Demo Browser) Example Failed Login',
        ipAddress: '192.168.1.100',
        errorMessage: 'Invalid credentials',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      },
      {
        id: generateId(),
        userSub: 'demo-user-12345',
        eventType: 'login',
        success: true,
        userAgent: 'Mozilla/5.0 (Demo Browser) Example Successful Login',
        ipAddress: '192.168.1.100',
        sessionId: 'demo-session-123',
        createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(), // 23 hours ago
      },
      {
        id: generateId(),
        userSub: 'demo-user-12345',
        eventType: 'logout',
        success: true,
        userAgent: 'Mozilla/5.0 (Demo Browser) Example Logout',
        ipAddress: '192.168.1.100',
        sessionId: 'demo-session-123',
        createdAt: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(), // 22 hours ago
      }
    ];
    
    setStorageData('loginEvents', demoEvents);
    console.log('📋 [DEMO] Added sample audit events for demonstration');
  }
}
