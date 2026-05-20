import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUserSession, getValidSession } from '../../db.js';
import {
  cleanupTestDB,
  createTestSession,
  createTestUser,
  setupTestDB,
  teardownTestDB,
} from './helpers.js';

describe('Disabled user session handling', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await cleanupTestDB();
  });

  it('rejects session creation for a disabled user', async () => {
    const user = await createTestUser({
      sub: 'disabled-login-sub',
      email: 'disabled-login@test.com',
      isActive: false,
      disabledAt: new Date(),
      disableReason: 'Disabled for test',
    });

    await expect(createUserSession({
      sub: user.sub,
      email: user.email,
      name: user.name,
      username: user.username,
      given_name: user.given_name,
      family_name: user.family_name,
    } as any, {
      access_token: 'token',
      refresh_token: 'refresh',
      id_token: 'id-token',
      expires_in: 3600,
    } as any)).rejects.toThrow('User account is disabled');
  });

  it('treats existing sessions for a disabled user as invalid', async () => {
    const user = await createTestUser({
      sub: 'disabled-session-sub',
      email: 'disabled-session@test.com',
    });
    const session = await createTestSession(user.id);

    const prisma = await import('../../db.js').then((module) => module.getPrismaClient());
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isActive: false,
        disabledAt: new Date(),
        disableReason: 'Disabled after session creation',
      },
    });

    await expect(getValidSession(session.id)).resolves.toBeNull();
  });
});