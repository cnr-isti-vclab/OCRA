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
import { insertHdtDocument, findHdtByProjectId } from '../repositories/hdt.repository.js';
import {
  findAnnotationGeometriesByProjectId,
  insertAnnotationGeometry,
} from '../repositories/annotation-geometry.repository.js';
import {
  findAnnotationDataByProjectId,
  insertAnnotationData,
} from '../repositories/annotation-data.repository.js';
import {
  findAnnotationLinksByProjectId,
  insertAnnotationLink,
} from '../repositories/annotation-link.repository.js';

const app = createApp();

describe('HDT scene deletion API', () => {
  let managerUser: any;
  let project: any;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await cleanupTestDB();
    managerUser = await createTestUser({ email: `scene-manager-${Date.now()}@test.com` });
    project = await createTestProject(managerUser.id, { name: `Scene Delete ${Date.now()}` });

    await insertHdtDocument({
      projectId: project.id,
      physicalObjectMetadata: {
        title: 'Scene Delete Project',
        dublinCore: {},
        cidocCrm: {},
      },
      digitalAssets: [],
      scenes: [
        {
          id: 'scene-delete-me',
          label: 'Delete me',
          description: '',
          isDefault: true,
          assets: [],
          createdAt: new Date(),
          createdBy: managerUser.sub,
        },
        {
          id: 'scene-keep-me',
          label: 'Keep me',
          description: '',
          isDefault: false,
          assets: [],
          createdAt: new Date(),
          createdBy: managerUser.sub,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: managerUser.sub,
    } as any);

    await insertAnnotationGeometry({
      id: 'geom-scene-delete',
      projectId: project.id,
      shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
      referenceType: 'scene',
      referenceId: 'scene-delete-me',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationData({
      id: 'data-scene-delete',
      projectId: project.id,
      label: 'Delete scene data',
      description: '',
      class: null,
      content: { text: 'scene delete' },
      visibilityType: 'scene',
      visibilityId: 'scene-delete-me',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationLink({
      id: 'link-scene-delete',
      projectId: project.id,
      geometryId: 'geom-scene-delete',
      dataId: 'data-scene-delete',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationGeometry({
      id: 'geom-scene-keep',
      projectId: project.id,
      shapes: [{ type: 'ShapePoints', vertices: [[1, 1, 1]] }],
      referenceType: 'scene',
      referenceId: 'scene-keep-me',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationData({
      id: 'data-scene-keep',
      projectId: project.id,
      label: 'Keep scene data',
      description: '',
      class: null,
      content: { text: 'scene keep' },
      visibilityType: 'scene',
      visibilityId: 'scene-keep-me',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationLink({
      id: 'link-scene-keep',
      projectId: project.id,
      geometryId: 'geom-scene-keep',
      dataId: 'data-scene-keep',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);
  });

  it('requires an owned exclusive structuring lock for scene deletion', async () => {
    const response = await request(app)
      .delete(`/api/projects/${project.id}/hdt/scenes/scene-delete-me`)
      .set(authHeaders(managerUser, 'scene-delete-no-lock'))
      .expect(409);

    expect(response.body).toHaveProperty('code', 'structuring.lock_missing');
  });

  it('deletes the scene and purges only scene-scoped annotations for that scene', async () => {
    const prisma = await getTestPrisma();
    const sessionHeaders = authHeaders(managerUser, 'scene-delete-session');

    await prisma.structuringLock.create({
      data: {
        projectId: project.id,
        ownerSessionId: 'scene-delete-session',
        ownerUserId: managerUser.id,
        state: StructuringLockState.exclusive,
        operationType: 'scene.delete',
        operationContext: { sceneId: 'scene-delete-me' },
        heartbeatExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await request(app)
      .delete(`/api/projects/${project.id}/hdt/scenes/scene-delete-me`)
      .set(sessionHeaders)
      .expect(200);

    expect(response.body.scenes.map((scene: any) => scene.id)).toEqual(['scene-keep-me']);

    const hdtDocument = await findHdtByProjectId(project.id);
    expect(hdtDocument?.scenes.map((scene: any) => scene.id)).toEqual(['scene-keep-me']);

    const geometries = await findAnnotationGeometriesByProjectId(project.id);
    const dataRecords = await findAnnotationDataByProjectId(project.id);
    const links = await findAnnotationLinksByProjectId(project.id);

    expect(geometries.map((entry) => entry.id)).toEqual(['geom-scene-keep']);
    expect(dataRecords.map((entry) => entry.id)).toEqual(['data-scene-keep']);
    expect(links.map((entry) => entry.id)).toEqual(['link-scene-keep']);
  });
});