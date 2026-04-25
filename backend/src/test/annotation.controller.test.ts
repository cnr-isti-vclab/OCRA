import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn((req, _res, next) => {
    req.user = {
      id: 'user-1',
      sub: 'user-1-sub',
      email: 'annotator@example.com',
      username: 'annotator',
      sys_admin: false,
    };
    req.sessionId = 'test-session';
    next();
  }),
  requireAdmin: vi.fn((_req, _res, next) => next()),
}));

vi.mock('../../db.js', () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock('../services/annotation.service.js', () => ({
  createAnnotationData: vi.fn(),
  createAnnotationGeometry: vi.fn(),
  createAnnotationLink: vi.fn(),
  getAnnotationsForScene: vi.fn(),
  getAnnotationData: vi.fn(),
  getAnnotationDataForSceneAssets: vi.fn(),
  getAnnotationGeometry: vi.fn(),
  getAnnotationGeometriesForSceneAssets: vi.fn(),
  getAnnotationLink: vi.fn(),
  getAnnotationLinksForProject: vi.fn(),
  getAnnotationLinksForSceneAssets: vi.fn(),
  markAnnotationDataErasable: vi.fn(),
  markAnnotationDataNonErasable: vi.fn(),
  markAnnotationGeometryErasable: vi.fn(),
  markAnnotationGeometryNonErasable: vi.fn(),
  markAnnotationLinkErasable: vi.fn(),
  markAnnotationLinkNonErasable: vi.fn(),
  updateAnnotationData: vi.fn(),
  updateAnnotationGeometryShapes: vi.fn(),
}));

import { getPrismaClient } from '../../db.js';
import { createApp } from '../app.js';
import * as annotationService from '../services/annotation.service.js';

const app = createApp();
const prismaMock = {
  user: {
    findUnique: vi.fn(),
  },
  projectRole: {
    findFirst: vi.fn(),
  },
};
const user = {
  id: 'user-1',
  sub: 'user-1-sub',
  email: 'annotator@example.com',
  username: 'annotator',
  sys_admin: false,
};
const project = {
  id: 'project-1',
  name: 'Annotation Project',
};

const shapePayload = {
  type: 'ShapePoints',
  vertices: [[0, 0, 0]],
};

function buildGeometry(projectId: string, geometryId = 'ag_test') {
  return {
    id: geometryId,
    projectId,
    shapes: [shapePayload],
    referenceType: 'scene',
    referenceId: 'scene-1',
    version: 0,
    erasableAt: null,
    erasableBy: null,
    createdAt: '2026-04-24T10:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-04-24T10:00:00.000Z',
    updatedBy: 'user-1',
  };
}

function buildData(projectId: string, dataId = 'ad_test') {
  return {
    id: dataId,
    projectId,
    label: 'Test annotation',
    description: 'Description',
    class: null,
    content: { note: 'content' },
    visibilityType: 'asset',
    visibilityId: 'asset-1',
    version: 0,
    erasableAt: null,
    erasableBy: null,
    createdAt: '2026-04-24T10:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-04-24T10:00:00.000Z',
    updatedBy: 'user-1',
  };
}

function buildLink(projectId: string, linkId = 'al_test') {
  return {
    id: linkId,
    projectId,
    geometryId: 'ag_test',
    dataId: 'ad_test',
    version: 0,
    erasableAt: '2026-04-24T10:00:00.000Z',
    erasableBy: 'user-1',
    createdAt: '2026-04-24T10:00:00.000Z',
    createdBy: 'user-1',
    updatedAt: '2026-04-24T10:00:00.000Z',
    updatedBy: 'user-1',
  };
}

describe.sequential('Annotation controller edge cases', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.projectRole.findFirst.mockResolvedValue({
      projectId: project.id,
      userId: user.id,
      role: 'manager',
    });
  });

  it('returns 404 when updating a missing geometry', async () => {
    vi.mocked(annotationService.updateAnnotationGeometryShapes).mockResolvedValueOnce({
      ok: false,
      code: 'geometry_not_found',
    } as never);

    const response = await request(app)
      .put(`/api/projects/${project.id}/annotations/geometry/ag_missing`)
      .send({ expectedVersion: 0, shapes: [shapePayload] })
      .expect(404);

    expect(response.body).toEqual({ error: 'Annotation geometry not found' });
    expect(annotationService.updateAnnotationGeometryShapes).toHaveBeenCalledWith(
      project.id,
      'ag_missing',
      0,
      [shapePayload],
      user.id,
    );
  });

  it('returns 409 when geometry update hits an OCC conflict', async () => {
    vi.mocked(annotationService.updateAnnotationGeometryShapes).mockResolvedValueOnce({
      ok: false,
      code: 'version_conflict',
    } as never);

    const response = await request(app)
      .put(`/api/projects/${project.id}/annotations/geometry/ag_test`)
      .send({ expectedVersion: 3, shapes: [shapePayload] })
      .expect(409);

    expect(response.body).toEqual({ error: 'Geometry version conflict' });
  });

  it('returns 404 when creating a link for missing referenced entities', async () => {
    vi.mocked(annotationService.createAnnotationLink).mockResolvedValueOnce({
      ok: false,
      code: 'geometry_not_found',
    } as never);

    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/links`)
      .send({ geometryId: 'ag_missing', dataId: 'ad_test' })
      .expect(404);

    expect(response.body).toEqual({ error: 'Referenced geometry not found' });
  });

  it('returns 409 when creating a duplicate link pair', async () => {
    vi.mocked(annotationService.createAnnotationLink).mockResolvedValueOnce({
      ok: false,
      code: 'duplicate_link_pair',
    } as never);

    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/links`)
      .send({ geometryId: 'ag_test', dataId: 'ad_test' })
      .expect(409);

    expect(response.body).toEqual({ error: 'Link pair already exists' });
  });

  it('returns 409 when creating a scope-incompatible link', async () => {
    vi.mocked(annotationService.createAnnotationLink).mockResolvedValueOnce({
      ok: false,
      code: 'scope_incompatible',
    } as never);

    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/links`)
      .send({ geometryId: 'ag_test', dataId: 'ad_test' })
      .expect(409);

    expect(response.body).toEqual({ error: 'Geometry and annotation data scopes are incompatible' });
  });

  it('returns 409 when restoring a link while geometry is still erasable', async () => {
    vi.mocked(annotationService.markAnnotationLinkNonErasable).mockResolvedValueOnce({
      ok: false,
      code: 'geometry_still_erasable',
    } as never);

    const response = await request(app)
      .patch(`/api/projects/${project.id}/annotations/links/al_test/nonerasable`)
      .send({ expectedVersion: 4 })
      .expect(409);

    expect(response.body).toEqual({ error: 'Linked geometry is still erasable' });
  });

  it('returns 404 when the requested scene bundle does not exist', async () => {
    vi.mocked(annotationService.getAnnotationsForScene).mockResolvedValueOnce({
      ok: false,
      code: 'scene_not_found',
    } as never);

    const response = await request(app)
      .get(`/api/projects/${project.id}/annotations/for-scene/scene-missing`)
      .expect(404);

    expect(response.body).toEqual({ error: 'Scene not found' });
  });

  it('returns 404 when scene geometries are requested for a missing scene', async () => {
    vi.mocked(annotationService.getAnnotationGeometriesForSceneAssets).mockResolvedValueOnce({
      ok: false,
      code: 'scene_not_found',
    } as never);

    const response = await request(app)
      .get(`/api/projects/${project.id}/annotations/geometry/for-scene/scene-missing`)
      .expect(404);

    expect(response.body).toEqual({ error: 'Scene not found' });
  });

  it('returns 404 when scene data are requested for a missing scene', async () => {
    vi.mocked(annotationService.getAnnotationDataForSceneAssets).mockResolvedValueOnce({
      ok: false,
      code: 'scene_not_found',
    } as never);

    const response = await request(app)
      .get(`/api/projects/${project.id}/annotations/data/for-scene/scene-missing`)
      .expect(404);

    expect(response.body).toEqual({ error: 'Scene not found' });
  });

  it('returns 404 when scene links are requested for a missing scene', async () => {
    vi.mocked(annotationService.getAnnotationLinksForSceneAssets).mockResolvedValueOnce({
      ok: false,
      code: 'scene_not_found',
    } as never);

    const response = await request(app)
      .get(`/api/projects/${project.id}/annotations/links/for-scene/scene-missing`)
      .expect(404);

    expect(response.body).toEqual({ error: 'Scene not found' });
  });
});