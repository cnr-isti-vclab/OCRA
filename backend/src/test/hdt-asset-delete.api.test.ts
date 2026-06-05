import fs from 'fs/promises';
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
import { ensureProjectSkeleton, projectModel3dAssetDir } from '../utils/project-static-paths.js';

const app = createApp();

describe('HDT asset deletion API', () => {
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
    managerUser = await createTestUser({ email: `asset-manager-${Date.now()}@test.com` });
    project = await createTestProject(managerUser.id, { name: `Asset Delete ${Date.now()}` });

    await insertHdtDocument({
      projectId: project.id,
      physicalObjectMetadata: {
        title: 'Asset Delete Project',
        dublinCore: {},
        cidocCrm: {},
      },
      digitalAssets: [
        {
          id: 'asset-delete-me',
          projectId: project.id,
          type: '3d-model',
          label: 'Delete me',
          entryPointUrl: '/assets/projects/test/3d-model/asset-delete-me/model.glb',
          uploadedAt: new Date(),
          uploadedBy: managerUser.sub,
        },
        {
          id: 'asset-keep-me',
          projectId: project.id,
          type: '3d-model',
          label: 'Keep me',
          entryPointUrl: '/assets/projects/test/3d-model/asset-keep-me/model.glb',
          uploadedAt: new Date(),
          uploadedBy: managerUser.sub,
        },
      ],
      scenes: [
        {
          id: 'scene-main',
          label: 'Main scene',
          description: '',
          isDefault: true,
          assets: [
            {
              assetId: 'asset-delete-me',
              visible: true,
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            },
            {
              assetId: 'asset-keep-me',
              visible: true,
              transform: { position: [1, 1, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
            },
          ],
          createdAt: new Date(),
          createdBy: managerUser.sub,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: managerUser.sub,
    } as any);

    await insertAnnotationGeometry({
      id: 'geom-asset-delete',
      projectId: project.id,
      shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
      referenceType: 'asset',
      referenceId: 'asset-delete-me',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationData({
      id: 'data-asset-delete',
      projectId: project.id,
      label: 'Delete asset data',
      description: '',
      class: null,
      content: { text: 'asset delete' },
      visibilityType: 'asset',
      visibilityId: 'asset-delete-me',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationLink({
      id: 'link-asset-delete',
      projectId: project.id,
      geometryId: 'geom-asset-delete',
      dataId: 'data-asset-delete',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationGeometry({
      id: 'geom-asset-keep',
      projectId: project.id,
      shapes: [{ type: 'ShapePoints', vertices: [[1, 1, 1]] }],
      referenceType: 'asset',
      referenceId: 'asset-keep-me',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationData({
      id: 'data-asset-keep',
      projectId: project.id,
      label: 'Keep asset data',
      description: '',
      class: null,
      content: { text: 'asset keep' },
      visibilityType: 'asset',
      visibilityId: 'asset-keep-me',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    await insertAnnotationLink({
      id: 'link-asset-keep',
      projectId: project.id,
      geometryId: 'geom-asset-keep',
      dataId: 'data-asset-keep',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: managerUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: managerUser.id,
    } as any);

    ensureProjectSkeleton(project.id);
    await fs.mkdir(projectModel3dAssetDir(project.id, 'asset-delete-me'), { recursive: true });
    await fs.writeFile(`${projectModel3dAssetDir(project.id, 'asset-delete-me')}/model.glb`, 'mesh-delete');
    await fs.mkdir(projectModel3dAssetDir(project.id, 'asset-keep-me'), { recursive: true });
    await fs.writeFile(`${projectModel3dAssetDir(project.id, 'asset-keep-me')}/model.glb`, 'mesh-keep');
  });

  it('requires an owned exclusive structuring lock for asset deletion', async () => {
    const response = await request(app)
      .delete(`/api/projects/${project.id}/hdt/assets/asset-delete-me`)
      .set(authHeaders(managerUser, 'asset-delete-no-lock'))
      .expect(409);

    expect(response.body).toHaveProperty('code', 'structuring.lock_missing');
  });

  it('deletes the asset, purges only asset-scoped annotations for that asset, and removes its files', async () => {
    const prisma = await getTestPrisma();
    const sessionHeaders = authHeaders(managerUser, 'asset-delete-session');

    await prisma.structuringLock.create({
      data: {
        projectId: project.id,
        ownerSessionId: 'asset-delete-session',
        ownerUserId: managerUser.id,
        state: StructuringLockState.exclusive,
        operationType: 'asset.delete',
        operationContext: { assetId: 'asset-delete-me' },
        heartbeatExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await request(app)
      .delete(`/api/projects/${project.id}/hdt/assets/asset-delete-me`)
      .set(sessionHeaders)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);

    const hdtDocument = await findHdtByProjectId(project.id);
    expect(hdtDocument?.digitalAssets.map((asset: any) => asset.id)).toEqual(['asset-keep-me']);
    expect(hdtDocument?.scenes[0]?.assets.map((asset: any) => asset.assetId)).toEqual(['asset-keep-me']);

    const geometries = await findAnnotationGeometriesByProjectId(project.id);
    const dataRecords = await findAnnotationDataByProjectId(project.id);
    const links = await findAnnotationLinksByProjectId(project.id);

    expect(geometries.map((entry) => entry.id)).toEqual(['geom-asset-keep']);
    expect(dataRecords.map((entry) => entry.id)).toEqual(['data-asset-keep']);
    expect(links.map((entry) => entry.id)).toEqual(['link-asset-keep']);

    await expect(fs.access(`${projectModel3dAssetDir(project.id, 'asset-delete-me')}/model.glb`)).rejects.toThrow();
    await expect(fs.access(`${projectModel3dAssetDir(project.id, 'asset-keep-me')}/model.glb`)).resolves.toBeUndefined();
  });
});