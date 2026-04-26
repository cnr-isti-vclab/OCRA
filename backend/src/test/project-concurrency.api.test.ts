import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  authHeaders,
  cleanupTestDB,
  createTestProject,
  createTestUser,
  getTestPrisma,
  setupTestDB,
  teardownTestDB,
} from './helpers.js';

const app = createApp();

describe('Project concurrency API', () => {
  let managerUser: any;
  let viewerUser: any;
  let project: any;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await cleanupTestDB();
    managerUser = await createTestUser({ email: 'manager@test.com' });
    viewerUser = await createTestUser({ email: 'viewer@test.com' });
    project = await createTestProject(managerUser.id, { name: `Concurrency ${Date.now()}` });

    const prisma = await getTestPrisma();
    await prisma.projectRole.create({
      data: {
        projectId: project.id,
        userId: viewerUser.id,
        role: 'viewer',
      },
    });
  });

  it('moves from draining to exclusive once remaining presence leaves', async () => {
    const viewerSessionHeaders = authHeaders(viewerUser, 'viewer-session');
    const managerSessionHeaders = authHeaders(managerUser, 'manager-session');

    const presenceStart = await request(app)
      .post(`/api/projects/${project.id}/presence/start`)
      .set(viewerSessionHeaders)
      .send({ mode: 'viewing', sceneId: 'scene-1', clientInstanceId: 'tab-viewer' })
      .expect(200);

    expect(presenceStart.body).toHaveProperty('success', true);
    expect(presenceStart.body).toHaveProperty('mode', 'viewing');

    const structuringStart = await request(app)
      .post(`/api/projects/${project.id}/structuring/start`)
      .set(managerSessionHeaders)
      .send({ operationType: 'scene.delete', operationContext: { sceneId: 'scene-1' } })
      .expect(200);

    expect(structuringStart.body).toHaveProperty('success', true);
    expect(structuringStart.body).toHaveProperty('state', 'draining');
    expect(structuringStart.body).toHaveProperty('remainingPresenceCount', 1);

    await request(app)
      .post(`/api/projects/${project.id}/presence/heartbeat`)
      .set(viewerSessionHeaders)
      .send({ mode: 'viewing', sceneId: 'scene-1', clientInstanceId: 'tab-viewer' })
      .expect(423);

    await request(app)
      .post(`/api/projects/${project.id}/presence/stop`)
      .set(viewerSessionHeaders)
      .send({ mode: 'viewing', sceneId: 'scene-1', clientInstanceId: 'tab-viewer' })
      .expect(200);

    const structuringHeartbeat = await request(app)
      .post(`/api/projects/${project.id}/structuring/heartbeat`)
      .set(managerSessionHeaders)
      .send({ fencingToken: structuringStart.body.fencingToken })
      .expect(200);

    expect(structuringHeartbeat.body).toHaveProperty('state', 'exclusive');
    expect(structuringHeartbeat.body).toHaveProperty('remainingPresenceCount', 0);

    await request(app)
      .post(`/api/projects/${project.id}/structuring/stop`)
      .set(managerSessionHeaders)
      .send({ fencingToken: structuringStart.body.fencingToken })
      .expect(200);
  });

  it('rejects structuring start for non-manager users', async () => {
    const response = await request(app)
      .post(`/api/projects/${project.id}/structuring/start`)
      .set(authHeaders(viewerUser, 'viewer-only-session'))
      .send({ operationType: 'scene.delete', operationContext: { sceneId: 'scene-1' } })
      .expect(403);

    expect(response.body).toHaveProperty('code', 'structuring.manager_required');
  });
});