import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  authHeaders,
  cleanupTestDB,
  createTestProject,
  createTestUser,
  setupTestDB,
  teardownTestDB,
} from './helpers.js';
import { insertHdtDocument } from '../repositories/hdt.repository.js';
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
import { createAnnotationEntityId } from '../repositories/annotation.repository.ids.js';

const app = createApp();

const shapePayload = {
  type: 'ShapePoints',
  vertices: [[0, 0, 0]],
};

describe.sequential('annotation deletion API', () => {
  let editorUser: Awaited<ReturnType<typeof createTestUser>>;
  let project: Awaited<ReturnType<typeof createTestProject>>;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await cleanupTestDB();
    editorUser = await createTestUser({ email: `annotation-delete-${Date.now()}@test.com` });
    project = await createTestProject(editorUser.id, { name: `Annotation Delete ${Date.now()}` });

    await insertHdtDocument({
      projectId: project.id,
      physicalObjectMetadata: {
        title: 'Annotation deletion project',
        dublinCore: {},
        cidocCrm: {},
      },
      digitalAssets: [
        {
          id: 'asset-delete-1',
          projectId: project.id,
          type: '3d-model',
          label: 'Asset delete 1',
          entryPointUrl: '/assets/projects/test/3d-model/asset-delete-1/model.glb',
          uploadedAt: new Date(),
          uploadedBy: editorUser.sub,
        },
        {
          id: 'asset-delete-2',
          projectId: project.id,
          type: '3d-model',
          label: 'Asset delete 2',
          entryPointUrl: '/assets/projects/test/3d-model/asset-delete-2/model.glb',
          uploadedAt: new Date(),
          uploadedBy: editorUser.sub,
        },
      ],
      scenes: [
        {
          id: 'scene-delete-a',
          label: 'Scene A',
          description: '',
          isDefault: true,
          assets: [
            {
              assetId: 'asset-delete-1',
              visible: true,
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            },
          ],
          createdAt: new Date(),
          createdBy: editorUser.sub,
        },
        {
          id: 'scene-delete-b',
          label: 'Scene B',
          description: '',
          isDefault: false,
          assets: [
            {
              assetId: 'asset-delete-2',
              visible: true,
              transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
            },
          ],
          createdAt: new Date(),
          createdBy: editorUser.sub,
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: editorUser.sub,
    } as never);
  });

  it('marks a link erasable without requiring endpoint deletion', async () => {
    const geometryId = createAnnotationEntityId('geometry');
    const dataId = createAnnotationEntityId('data');
    const linkId = createAnnotationEntityId('link');

    await insertAnnotationGeometry({
      id: geometryId,
      projectId: project.id,
      shapes: [shapePayload],
      referenceType: 'scene',
      referenceId: 'scene-delete-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationData({
      id: dataId,
      projectId: project.id,
      label: 'Shared note',
      description: '',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-delete-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationLink({
      id: linkId,
      projectId: project.id,
      geometryId,
      dataId,
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    const response = await request(app)
      .patch(`/api/projects/${project.id}/annotations/links/${linkId}/erasable`)
      .set(authHeaders(editorUser))
      .send({ expectedVersion: 0 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.version).toBe(1);
    expect(response.body.updatedAt).not.toBeNull();

    const links = await findAnnotationLinksByProjectId(project.id);
    const geometries = await findAnnotationGeometriesByProjectId(project.id);
    const data = await findAnnotationDataByProjectId(project.id);
    expect(links.find((entry) => entry.id === linkId)?.erasableAt).not.toBeNull();
    expect(geometries.find((entry) => entry.id === geometryId)?.erasableAt).toBeNull();
    expect(data.find((entry) => entry.id === dataId)?.erasableAt).toBeNull();
  });

  it('rejects geometry erasable while a non-erasable link still references it', async () => {
    const geometryId = createAnnotationEntityId('geometry');
    const dataId = createAnnotationEntityId('data');
    const linkId = createAnnotationEntityId('link');

    await insertAnnotationGeometry({
      id: geometryId,
      projectId: project.id,
      shapes: [shapePayload],
      referenceType: 'scene',
      referenceId: 'scene-delete-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationData({
      id: dataId,
      projectId: project.id,
      label: 'Linked note',
      description: '',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-delete-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationLink({
      id: linkId,
      projectId: project.id,
      geometryId,
      dataId,
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    const response = await request(app)
      .patch(`/api/projects/${project.id}/annotations/geometry/${geometryId}/erasable`)
      .set(authHeaders(editorUser))
      .send({ expectedVersion: 0 })
      .expect(409);

    expect(response.body.code).toBe('annotation.geometry.still_linked');
  });

  it('allows geometry erasable after its only link is marked erasable', async () => {
    const geometryId = createAnnotationEntityId('geometry');
    const dataId = createAnnotationEntityId('data');
    const linkId = createAnnotationEntityId('link');

    await insertAnnotationGeometry({
      id: geometryId,
      projectId: project.id,
      shapes: [shapePayload],
      referenceType: 'scene',
      referenceId: 'scene-delete-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationData({
      id: dataId,
      projectId: project.id,
      label: 'Linked note',
      description: '',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-delete-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationLink({
      id: linkId,
      projectId: project.id,
      geometryId,
      dataId,
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await request(app)
      .patch(`/api/projects/${project.id}/annotations/links/${linkId}/erasable`)
      .set(authHeaders(editorUser))
      .send({ expectedVersion: 0 })
      .expect(200);

    const response = await request(app)
      .patch(`/api/projects/${project.id}/annotations/geometry/${geometryId}/erasable`)
      .set(authHeaders(editorUser))
      .send({ expectedVersion: 0 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.version).toBe(1);

    const geometries = await findAnnotationGeometriesByProjectId(project.id);
    expect(geometries.find((entry) => entry.id === geometryId)?.erasableAt).not.toBeNull();
  });

  it('rejects data erasable when another scene still has a non-erasable link', async () => {
    const geometryAId = createAnnotationEntityId('geometry');
    const geometryBId = createAnnotationEntityId('geometry');
    const dataId = createAnnotationEntityId('data');
    const linkAId = createAnnotationEntityId('link');
    const linkBId = createAnnotationEntityId('link');

    await insertAnnotationGeometry({
      id: geometryAId,
      projectId: project.id,
      shapes: [shapePayload],
      referenceType: 'scene',
      referenceId: 'scene-delete-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationGeometry({
      id: geometryBId,
      projectId: project.id,
      shapes: [shapePayload],
      referenceType: 'scene',
      referenceId: 'scene-delete-b',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationData({
      id: dataId,
      projectId: project.id,
      label: 'Cross-scene note',
      description: '',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-delete-a',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationLink({
      id: linkAId,
      projectId: project.id,
      geometryId: geometryAId,
      dataId,
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationLink({
      id: linkBId,
      projectId: project.id,
      geometryId: geometryBId,
      dataId,
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    await request(app)
      .patch(`/api/projects/${project.id}/annotations/links/${linkAId}/erasable`)
      .set(authHeaders(editorUser))
      .send({ expectedVersion: 0 })
      .expect(200);

    const response = await request(app)
      .patch(`/api/projects/${project.id}/annotations/data/${dataId}/erasable`)
      .set(authHeaders(editorUser))
      .send({ expectedVersion: 0 })
      .expect(409);

    expect(response.body.code).toBe('annotation.data.still_linked');

    const links = await findAnnotationLinksByProjectId(project.id);
    expect(links.find((entry) => entry.id === linkBId)?.erasableAt).toBeNull();
  });
});
