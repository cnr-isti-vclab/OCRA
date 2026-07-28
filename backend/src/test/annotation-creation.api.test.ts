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

describe.sequential('annotation creation API', () => {
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
    editorUser = await createTestUser({ email: `annotation-create-${Date.now()}@test.com` });
    project = await createTestProject(editorUser.id, { name: `Annotation Create ${Date.now()}` });

    await insertHdtDocument({
      projectId: project.id,
      physicalObjectMetadata: {
        title: 'Annotation creation project',
        dublinCore: {},
        cidocCrm: {},
      },
      digitalAssets: [
        {
          id: 'asset-create-1',
          projectId: project.id,
          type: '3d-model',
          label: 'Asset create 1',
          entryPointUrl: '/assets/projects/test/3d-model/asset-create-1/model.glb',
          uploadedAt: new Date(),
          uploadedBy: editorUser.sub,
        },
      ],
      scenes: [
        {
          id: 'scene-create-1',
          label: 'Scene create 1',
          description: '',
          isDefault: true,
          assets: [
            {
              assetId: 'asset-create-1',
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

  it('creates geometry-only documents with version 0', async () => {
    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/geometry`)
      .set(authHeaders(editorUser))
      .send({
        shapes: [shapePayload],
        referenceType: 'scene',
        referenceId: 'scene-create-1',
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.geometry.version).toBe(0);
    expect(response.body.geometry.referenceId).toBe('scene-create-1');
  });

  it('creates data-only documents with version 0', async () => {
    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/data`)
      .set(authHeaders(editorUser))
      .send({
        label: 'Fragment note',
        description: 'Created in test',
        class: null,
        content: { note: 'hello' },
        visibilityType: 'scene',
        visibilityId: 'scene-create-1',
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.datum.version).toBe(0);
    expect(response.body.datum.label).toBe('Fragment note');
  });

  it('supports sequential geometry, data, and link creation', async () => {
    const geometryResponse = await request(app)
      .post(`/api/projects/${project.id}/annotations/geometry`)
      .set(authHeaders(editorUser))
      .send({
        shapes: [shapePayload],
        referenceType: 'scene',
        referenceId: 'scene-create-1',
      })
      .expect(201);

    const dataResponse = await request(app)
      .post(`/api/projects/${project.id}/annotations/data`)
      .set(authHeaders(editorUser))
      .send({
        label: 'Linked note',
        description: '',
        class: null,
        content: {},
        visibilityType: 'scene',
        visibilityId: 'scene-create-1',
      })
      .expect(201);

    const linkResponse = await request(app)
      .post(`/api/projects/${project.id}/annotations/links`)
      .set(authHeaders(editorUser))
      .send({
        geometryId: geometryResponse.body.geometry.id,
        dataId: dataResponse.body.datum.id,
      })
      .expect(201);

    expect(linkResponse.body.link.version).toBe(0);
    expect(linkResponse.body.link.geometryId).toBe(geometryResponse.body.geometry.id);
    expect(linkResponse.body.link.dataId).toBe(dataResponse.body.datum.id);
  });

  it('links existing geometry and data without creating new documents', async () => {
    const geometryId = createAnnotationEntityId('geometry');
    const dataId = createAnnotationEntityId('data');

    await insertAnnotationGeometry({
      id: geometryId,
      projectId: project.id,
      shapes: [shapePayload],
      referenceType: 'scene',
      referenceId: 'scene-create-1',
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
      label: 'Existing note',
      description: '',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-create-1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: new Date().toISOString(),
      createdBy: editorUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: editorUser.id,
    } as never);

    const beforeGeometries = await findAnnotationGeometriesByProjectId(project.id);
    const beforeData = await findAnnotationDataByProjectId(project.id);

    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/links`)
      .set(authHeaders(editorUser))
      .send({
        geometryId,
        dataId,
      })
      .expect(201);

    const afterGeometries = await findAnnotationGeometriesByProjectId(project.id);
    const afterData = await findAnnotationDataByProjectId(project.id);
    const links = await findAnnotationLinksByProjectId(project.id);

    expect(response.body.link.geometryId).toBe(geometryId);
    expect(response.body.link.dataId).toBe(dataId);
    expect(beforeGeometries.length).toBe(afterGeometries.length);
    expect(beforeData.length).toBe(afterData.length);
    expect(links.some((link) => link.id === response.body.link.id)).toBe(true);
  });

  it('reactivates an erasable link when recreating the same geometry/data pair', async () => {
    const geometryId = createAnnotationEntityId('geometry');
    const dataId = createAnnotationEntityId('data');
    const linkId = createAnnotationEntityId('link');
    const timestamp = new Date().toISOString();

    await insertAnnotationGeometry({
      id: geometryId,
      projectId: project.id,
      shapes: [shapePayload],
      referenceType: 'scene',
      referenceId: 'scene-create-1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: timestamp,
      createdBy: editorUser.id,
      updatedAt: timestamp,
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationData({
      id: dataId,
      projectId: project.id,
      label: 'Detached note',
      description: '',
      class: null,
      content: {},
      visibilityType: 'scene',
      visibilityId: 'scene-create-1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: timestamp,
      createdBy: editorUser.id,
      updatedAt: timestamp,
      updatedBy: editorUser.id,
    } as never);

    await insertAnnotationLink({
      id: linkId,
      projectId: project.id,
      geometryId,
      dataId,
      version: 2,
      erasableAt: timestamp,
      erasableBy: editorUser.id,
      createdAt: timestamp,
      createdBy: editorUser.id,
      updatedAt: timestamp,
      updatedBy: editorUser.id,
    } as never);

    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/links`)
      .set(authHeaders(editorUser))
      .send({ geometryId, dataId })
      .expect(200);

    expect(response.body.link.id).toBe(linkId);
    expect(response.body.link.erasableAt).toBeNull();
    expect(response.body.link.version).toBe(3);

    const links = await findAnnotationLinksByProjectId(project.id);
    const stored = links.find((link) => link.id === linkId);
    expect(stored?.erasableAt).toBeNull();
    expect(stored?.version).toBe(3);
    expect(links.filter((link) => link.geometryId === geometryId && link.dataId === dataId)).toHaveLength(1);
  });

  it('returns 409 on geometry update OCC conflict but not on create', async () => {
    const createResponse = await request(app)
      .post(`/api/projects/${project.id}/annotations/geometry`)
      .set(authHeaders(editorUser))
      .send({
        shapes: [shapePayload],
        referenceType: 'scene',
        referenceId: 'scene-create-1',
      })
      .expect(201);

    const geometryId = createResponse.body.geometry.id as string;

    await request(app)
      .put(`/api/projects/${project.id}/annotations/geometry/${geometryId}`)
      .set(authHeaders(editorUser))
      .send({
        expectedVersion: 99,
        shapes: [shapePayload],
      })
      .expect(409);

    const geometries = await findAnnotationGeometriesByProjectId(project.id);
    const stored = geometries.find((item) => item.id === geometryId);
    expect(stored?.version).toBe(0);
  });
});
