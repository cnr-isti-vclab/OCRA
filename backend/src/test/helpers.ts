/**
 * Test Setup Helpers
 * 
 * Utilities for setting up and tearing down test database
 */

import { PrismaClient } from '@prisma/client';

// Use globalThis to share Prisma instance across test workers
declare global {
  var __testPrisma: PrismaClient | null | undefined;
}

let prisma: PrismaClient | null = null;

/**
 * Get or create the shared Prisma instance
 */
function getPrismaInstance() {
  if (globalThis.__testPrisma === undefined) {
    globalThis.__testPrisma = null;
  }
  return globalThis.__testPrisma;
}

/**
 * Set the shared Prisma instance
 */
function setPrismaInstance(instance: PrismaClient | null) {
  globalThis.__testPrisma = instance;
}

/**
 * Initialize test database connection
 */
export async function setupTestDB() {
  let currentPrisma = getPrismaInstance();
  if (!currentPrisma) {
    console.log('🔧 Initializing Prisma client for tests...');
    currentPrisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
        },
      },
    });
    await currentPrisma.$connect();
    setPrismaInstance(currentPrisma);
    console.log('✅ Prisma client connected');
  }
  return currentPrisma;
}

/**
 * Ensure Prisma is initialized (auto-init if needed)
 */
export async function ensurePrisma() {
  let currentPrisma = getPrismaInstance();
  if (!currentPrisma) {
    currentPrisma = await setupTestDB();
  }
  if (!currentPrisma) {
    throw new Error('Failed to initialize Prisma client');
  }
  return currentPrisma;
}

/**
 * Clean up test database
 */
export async function cleanupTestDB() {
  const client = await ensurePrisma();
  console.log('🧹 Cleaning up test database...');
  try {
    // Use transaction for atomic cleanup
    await client.$transaction([
      client.projectPresenceLease.deleteMany({}),
      client.structuringLock.deleteMany({}),
      client.projectRole.deleteMany({}),
      client.project.deleteMany({}),
      client.session.deleteMany({}),
      client.user.deleteMany({}),
    ]);
  } catch (error) {
    console.error('Error cleaning up test database:', error);
    throw error;
  }
}

/**
 * Tear down test database connection
 */
export async function teardownTestDB() {
  const currentPrisma = getPrismaInstance();
  if (currentPrisma) {
    await currentPrisma.$disconnect();
    setPrismaInstance(null);
  }
}

/**
 * Get Prisma client for tests
 */
export async function getTestPrisma() {
  return await ensurePrisma();
}

/**
 * Create a test user
 */
export async function createTestUser(overrides: any = {}) {
  const client = await ensurePrisma();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  
  return await client.user.create({
    data: {
      sub: overrides.sub || `test-sub-${timestamp}-${random}`,
      email: overrides.email || `test-${timestamp}-${random}@example.com`,
      name: overrides.name || 'Test User',
      username: overrides.username || `testuser${timestamp}${random}`,
      given_name: overrides.given_name || 'Test',
      family_name: overrides.family_name || 'User',
      sys_admin: overrides.sys_admin || overrides.isAdmin || false,
      sys_creator: overrides.sys_creator || (overrides.canCreateProjects ?? true),
    },
  });
}

/**
 * Create a test project
 */
export async function createTestProject(creatorId?: string, overrides: any = {}) {
  const client = await ensurePrisma();
  const projectData: any = {
    name: overrides.name || `Test Project ${Date.now()}`,
    description: overrides.description || 'Test project description',
  };
  
  const project = await client.project.create({
    data: projectData,
  });
  
  // If creatorId provided, verify user exists before creating role
  if (creatorId) {
    const userExists = await client.user.findUnique({ where: { id: creatorId } });
    if (userExists) {
      await client.projectRole.create({
        data: {
          userId: creatorId,
          projectId: project.id,
          role: 'manager',
        },
      });
    }
  }
  
  return project;
}

/**
 * Create a test session
 */
export async function createTestSession(userId: string, overrides: any = {}) {
  const client = await ensurePrisma();
  return await client.session.create({
    data: {
      userId: userId,
      accessToken: overrides.accessToken || 'test-access-token',
      refreshToken: overrides.refreshToken || 'test-refresh-token',
      idToken: overrides.idToken || 'test-id-token',
      expiresAt: overrides.expiresAt || new Date(Date.now() + 3600000),
    },
  });
}

/**
 * Mock authentication middleware for tests
 */
export function mockAuthMiddleware(user: any) {
  return (req: any, res: any, next: any) => {
    req.user = user;
    req.sessionId = 'test-session-id';
    next();
  };
}

/**
 * Set authentication header for test requests
 * Use with supertest: .set(authHeader(user))
 */
export function authHeader(user: any): { 'X-Test-User-Id': string } {
  return { 'X-Test-User-Id': user.id };
}

export function authHeaders(user: any, sessionId = 'test-session-id'): { 'X-Test-User-Id': string; 'X-Test-Session-Id': string } {
  return {
    'X-Test-User-Id': user.id,
    'X-Test-Session-Id': sessionId,
  };
}

/**
 * Create authenticated test context with user
 */
export async function createAuthContext(overrides: any = {}) {
  const user = await createTestUser(overrides);
  return {
    user,
    headers: authHeader(user),
  };
}
