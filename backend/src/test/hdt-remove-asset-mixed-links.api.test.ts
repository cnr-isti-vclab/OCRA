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
import { insertHdtDocument } from '../repositories/hdt.repository.js';
import { insertAnnotationGeometry } from '../repositories/annotation-geometry.repository.js';
import { insertAnnotationData } from '../repositories/annotation-data.repository.js';
import {
  findAnnotationLinksByProjectId,
  insertAnnotationLink,
} from '../repositories/annotation-link.repository.js';
import { createAnnotationEntityId } from '../repositories/annotation.repository.ids.js';

const app = createApp();

describe.sequential('HDT remove asset soft-deletes mixed annotation links', () => {
  let managerUser: Awaited<ReturnType<typeof createTestUser>>;
  let project: Awaited<ReturnType<typeof createTestProject>>;
  let sessionHeaders: Record<string, string>;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await cleanupTestDB();

    managerUser = await createTestUser({ email: `remove-asset-mixed-${Date.now()}@test.com` });
    project = await createTestProject(managerUser.id, { name: `Remove Asset Mixed ${Date.now()}` });
    sessionHeaders = authHeaders(managerUser, 'remove-asset-mixed-session');

    const prisma = await getTestPrisma();
    await prisma.structuringLock.create({
      data: {
        projectId: project.id,
        ownerSessionId: 'remove-asset-mixed-session',
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
          id: 'asset-a',
          projectId: project.id,
          type: 'rti',
          label: 'Asset A',
          entryPointUrl: '/assets/projects/test/rti/asset-a/info.json',
          uploadedAt: new Date(),
          uploadedBy: managerUser.sub,
        },
        {
          id: 'asset-b',
          projectId: project.id,
          type: 'rti',
          label: 'Asset B',
          entryPointUrl: '/assets/projects/test/rti/asset-b/info.json',
          uploadedAt: new Date(),
          uploadedBy: managerUser.sub,
        },
      ],
      scenes: [
        {
          id: 'scene-main',
          label: 'Main',
          isDefault: true,
          assets: [
            { assetId: 'asset-a', visible: true },
            { assetId: 'asset-b', visible: true },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: managerUser.sub,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: managerUser.sub,
    } as never);
  });

  it('marks only mixed scene↔asset links erasable when an asset leaves the scene', async () => {
    const now = new Date().toISOString();
    const sceneGeometryId = createAnnotationEntityId('geometry');
    const assetGeometryId = createAnnotationEntityId('geometry');
    const sceneDataId = createAnnotationEntityId('data');
    const assetDataId = createAnnotationEntityId('data');

    await insertAnnotationGeometry({
      id: sceneGeometryId,
      projectId: project.id,
      shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
      referenceType: 'scene',
      referenceId: 'scene-main',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: now,
      createdBy: managerUser.id,
      updatedAt: now,
      updatedBy: managerUser.id,
    } as never);
    await insertAnnotationGeometry({
      id: assetGeometryId,
      projectId: project.id,
      shapes: [{ type: 'ShapePoints', vertices: [[1, 0, 0]] }],
      referenceType: 'asset',
      referenceId: 'asset-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: now,
      createdBy: managerUser.id,
      updatedAt: now,
      updatedBy: managerUser.id,
    } as never);
    await insertAnnotationData({
      id: sceneDataId,
      projectId: project.id,
      label: 'Scene data',
      description: null,
      class: null,
      appearance: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-main',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: now,
      createdBy: managerUser.id,
      updatedAt: now,
      updatedBy: managerUser.id,
    } as never);
    await insertAnnotationData({
      id: assetDataId,
      projectId: project.id,
      label: 'Asset data',
      description: null,
      class: null,
      appearance: null,
      content: {},
      visibilityType: 'asset',
      visibilityId: 'asset-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: now,
      createdBy: managerUser.id,
      updatedAt: now,
      updatedBy: managerUser.id,
    } as never);

    const mixedLinkSceneGeoAssetData = createAnnotationEntityId('link');
    const mixedLinkAssetGeoSceneData = createAnnotationEntityId('link');
    const sceneSceneLink = createAnnotationEntityId('link');
    const assetAssetLink = createAnnotationEntityId('link');

    for (const [id, geometryId, dataId] of [
      [mixedLinkSceneGeoAssetData, sceneGeometryId, assetDataId],
      [mixedLinkAssetGeoSceneData, assetGeometryId, sceneDataId],
      [sceneSceneLink, sceneGeometryId, sceneDataId],
      [assetAssetLink, assetGeometryId, assetDataId],
    ] as const) {
      await insertAnnotationLink({
        id,
        projectId: project.id,
        geometryId,
        dataId,
        version: 0,
        erasableAt: null,
        erasableBy: null,
        createdAt: now,
        createdBy: managerUser.id,
        updatedAt: now,
        updatedBy: managerUser.id,
      } as never);
    }

    await request(app)
      .delete(`/api/projects/${project.id}/hdt/scenes/scene-main/assets/asset-a`)
      .set(sessionHeaders)
      .expect(200);

    const links = await findAnnotationLinksByProjectId(project.id);
    const byId = new Map(links.map((link) => [link.id, link]));

    expect(byId.get(mixedLinkSceneGeoAssetData)?.erasableAt).not.toBeNull();
    expect(byId.get(mixedLinkAssetGeoSceneData)?.erasableAt).not.toBeNull();
    expect(byId.get(sceneSceneLink)?.erasableAt).toBeNull();
    expect(byId.get(assetAssetLink)?.erasableAt).toBeNull();
  });
});
