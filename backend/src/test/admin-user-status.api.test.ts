import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { StructuringLockState } from '@prisma/client';
import { createApp } from '../app.js';
import {
  authHeader,
  cleanupTestDB,
  createTestProject,
  createTestSession,
  createTestUser,
  getTestPrisma,
  setupTestDB,
  teardownTestDB,
} from './helpers.js';

const app = createApp();

describe('Admin user status API', () => {
  let adminUser: any;
  let targetUser: any;
  let project: any;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await cleanupTestDB();
    adminUser = await createTestUser({ email: `admin-${Date.now()}@test.com`, sys_admin: true });
    targetUser = await createTestUser({ email: `target-${Date.now()}@test.com` });
    project = await createTestProject(adminUser.id, { name: `Disable User ${Date.now()}` });
  });

  it('disables a user and removes active sessions, presence leases, and structuring locks', async () => {
    const prisma = await getTestPrisma();
    await createTestSession(targetUser.id);
    await prisma.projectPresenceLease.create({
      data: {
        leaseKey: 'disabled-user:viewing:-:tab-1',
        projectId: project.id,
        sessionId: 'disabled-user-session',
        userId: targetUser.id,
        mode: 'viewing',
        clientInstanceId: 'tab-1',
        lastHeartbeatAt: new Date(),
        heartbeatExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.structuringLock.create({
      data: {
        projectId: project.id,
        ownerSessionId: 'disabled-user-session',
        ownerUserId: targetUser.id,
        state: StructuringLockState.exclusive,
        operationType: 'scene.delete',
        operationContext: { sceneId: 'scene-1' },
        heartbeatExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await request(app)
      .put(`/api/admin/users/${targetUser.id}/status`)
      .set(authHeader(adminUser))
      .send({ isActive: false, disableReason: 'Account archived' })
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('user.isActive', false);
    expect(response.body).toHaveProperty('user.disableReason', 'Account archived');

    const disabledUser = await prisma.user.findUnique({ where: { id: targetUser.id } });
    expect(disabledUser?.isActive).toBe(false);
    expect(disabledUser?.disabledAt).not.toBeNull();
    expect(disabledUser?.disabledBy).toBe(adminUser.id);

    expect(await prisma.session.count({ where: { userId: targetUser.id } })).toBe(0);
    expect(await prisma.projectPresenceLease.count({ where: { userId: targetUser.id } })).toBe(0);
    expect(await prisma.structuringLock.count({ where: { ownerUserId: targetUser.id } })).toBe(0);
  });

  it('reactivates a previously disabled user', async () => {
    const prisma = await getTestPrisma();
    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        isActive: false,
        disabledAt: new Date(),
        disabledBy: adminUser.id,
        disableReason: 'Temporary disable',
      },
    });

    const response = await request(app)
      .put(`/api/admin/users/${targetUser.id}/status`)
      .set(authHeader(adminUser))
      .send({ isActive: true })
      .expect(200);

    expect(response.body).toHaveProperty('user.isActive', true);
    expect(response.body.user.disabledAt).toBeNull();
    expect(response.body.user.disabledBy).toBeNull();
    expect(response.body.user.disableReason).toBeNull();
  });

  it('rejects disabling a system administrator', async () => {
    const sysAdminTarget = await createTestUser({
      email: `sys-admin-target-${Date.now()}@test.com`,
      sys_admin: true,
    });

    const response = await request(app)
      .put(`/api/admin/users/${sysAdminTarget.id}/status`)
      .set(authHeader(adminUser))
      .send({ isActive: false, disableReason: 'Should fail' })
      .expect(400);

    expect(response.body).toHaveProperty('error', 'System administrators cannot be disabled');

    const prisma = await getTestPrisma();
    const unchangedUser = await prisma.user.findUnique({ where: { id: sysAdminTarget.id } });
    expect(unchangedUser?.isActive).toBe(true);
    expect(unchangedUser?.disabledAt).toBeNull();
  });
});