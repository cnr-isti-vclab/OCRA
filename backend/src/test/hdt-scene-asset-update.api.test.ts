import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { StructuringLockState } from '@prisma/client';
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
import { findHdtByProjectId, insertHdtDocument } from '../repositories/hdt.repository.js';

const app = createApp();

describe('HDT scene asset update API', () => {
  let managerUser: any;
  let project: any;
  let sessionHeaders: Record<string, string>;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await cleanupTestDB();

    managerUser = await createTestUser({ email: `scene-asset-update-${Date.now()}@test.com` });
    project = await createTestProject(managerUser.id, { name: `Scene Asset Update ${Date.now()}` });
    sessionHeaders = authHeaders(managerUser, 'scene-asset-update-session');

    const prisma = await getTestPrisma();
    await prisma.structuringLock.create({
      data: {
        projectId: project.id,
        ownerSessionId: 'scene-asset-update-session',
        ownerUserId: managerUser.id,
        state: StructuringLockState.exclusive,
        operationType: 'project.update',
        operationContext: { projectId: project.id },
        heartbeatExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    await insertHdtDocument({
      projectId: project.id,
      physicalObjectMetadata: {
        sourceUri: `urn:ocra:project:${project.id}`,
        sourceType: 'other',
        dublinCore: {},
        cidocCrm: {},
      },
      digitalAssets: [
        {
          id: 'asset-model-1',
          projectId: project.id,
          type: '3d-model',
          label: 'Model 1',
          entryPointUrl: '/assets/projects/test/3d-model/asset-model-1/model.glb',
          uploadedAt: new Date(),
          uploadedBy: managerUser.sub,
        },
      ],
      scenes: [
        {
          id: 'scene-main',
          label: 'Main scene',
          isDefault: true,
          assets: [
            {
              assetId: 'asset-model-1',
              visible: true,
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: managerUser.sub,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: managerUser.sub,
    } as any);
  });

  it('rejects invalid scene asset transform payloads with a validation error', async () => {
    const response = await request(app)
      .put(`/api/projects/${project.id}/hdt/scenes/scene-main/assets/asset-model-1`)
      .set(sessionHeaders)
      .send({
        position: [1, 2],
      })
      .expect(400);

    expect(response.body).toHaveProperty('code', 'common.validation_error');
    expect(response.body).toHaveProperty('error', 'Invalid scene asset update payload');
    expect(Array.isArray(response.body.details)).toBe(true);
    expect(response.body.details.some((detail: string) => detail.startsWith('position:'))).toBe(true);
  });

  it('persists validated position, rotation, and scale updates in the scene asset reference', async () => {
    await request(app)
      .put(`/api/projects/${project.id}/hdt/scenes/scene-main/assets/asset-model-1`)
      .set(sessionHeaders)
      .send({
        position: [1, 2, 3],
        rotation: [10, 20, 30],
        scale: [2, 2, 2],
      })
      .expect(200);

    const document = await findHdtByProjectId(project.id);
    const scene = document?.scenes.find((entry) => entry.id === 'scene-main');
    const assetRef = scene?.assets.find((entry) => entry.assetId === 'asset-model-1');

    expect(assetRef).toMatchObject({
      assetId: 'asset-model-1',
      position: [1, 2, 3],
      rotation: [10, 20, 30],
      scale: [2, 2, 2],
    });
  });
});
