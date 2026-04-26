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

vi.mock('../lib/annotation-events.js', () => ({
  publishAnnotationMutation: vi.fn(),
  publishAnnotationSocialLockStart: vi.fn(),
  publishAnnotationSocialLockStop: vi.fn(),
  subscribeToAnnotationEvents: vi.fn(),
}));

import { getPrismaClient } from '../../db.js';
import { createApp } from '../app.js';
import * as annotationService from '../services/annotation.service.js';
import * as annotationEvents from '../lib/annotation-events.js';

const app = createApp();
const prismaMock = {
  structuringLock: {
    findUnique: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
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
    prismaMock.structuringLock.findUnique.mockResolvedValue(null);
    prismaMock.project.findUnique.mockResolvedValue({ public: false });
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

    expect(response.body.error).toBe('Annotation geometry not found');
    expect(response.body.code).toBe('annotation.geometry.not_found');
    expect(response.body.status).toBe(404);
    expect(response.body.success).toBe(false);
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

    expect(response.body.error).toBe('Geometry version conflict');
    expect(response.body.code).toBe('annotation.geometry.version_conflict');
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

    expect(response.body.error).toBe('Referenced geometry not found');
    expect(response.body.code).toBe('annotation.geometry.not_found');
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

    expect(response.body.error).toBe('Link pair already exists');
    expect(response.body.code).toBe('annotation.link.duplicate_pair');
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

    expect(response.body.error).toBe('Geometry and annotation data scopes are incompatible');
    expect(response.body.code).toBe('annotation.link.scope_incompatible');
  });

  it('returns the restored link when a non-erasable transition succeeds', async () => {
    vi.mocked(annotationService.markAnnotationLinkNonErasable).mockResolvedValueOnce({
      ok: true,
      value: {
        linkVersion: 5,
        geometryVersion: 7,
        dataVersion: 9,
      },
    } as never);

    vi.mocked(annotationService.getAnnotationLink).mockResolvedValueOnce({
      ok: true,
      value: {
        id: 'al_test',
        projectId: project.id,
        geometryId: 'ag_test',
        dataId: 'ad_test',
        version: 5,
        erasableAt: null,
        erasableBy: null,
        createdAt: '2026-04-24T10:00:00.000Z',
        createdBy: user.id,
        updatedAt: '2026-04-25T10:00:00.000Z',
        updatedBy: user.id,
      },
    } as never);

    const response = await request(app)
      .patch(`/api/projects/${project.id}/annotations/links/al_test/nonerasable`)
      .send({ expectedVersion: 4 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.linkVersion).toBe(5);
    expect(response.body.geometryVersion).toBe(7);
    expect(response.body.dataVersion).toBe(9);
  });

  it('returns 404 when the requested scene bundle does not exist', async () => {
    vi.mocked(annotationService.getAnnotationsForScene).mockResolvedValueOnce({
      ok: false,
      code: 'scene_not_found',
    } as never);

    const response = await request(app)
      .get(`/api/projects/${project.id}/annotations/for-scene/scene-missing`)
      .expect(404);

    expect(response.body.error).toBe('Scene not found');
    expect(response.body.code).toBe('annotation.scene.not_found');
  });

  it('returns 404 when scene geometries are requested for a missing scene', async () => {
    vi.mocked(annotationService.getAnnotationGeometriesForSceneAssets).mockResolvedValueOnce({
      ok: false,
      code: 'scene_not_found',
    } as never);

    const response = await request(app)
      .get(`/api/projects/${project.id}/annotations/geometry/for-scene/scene-missing`)
      .expect(404);

    expect(response.body.error).toBe('Scene not found');
    expect(response.body.code).toBe('annotation.scene.not_found');
  });

  it('returns 404 when scene data are requested for a missing scene', async () => {
    vi.mocked(annotationService.getAnnotationDataForSceneAssets).mockResolvedValueOnce({
      ok: false,
      code: 'scene_not_found',
    } as never);

    const response = await request(app)
      .get(`/api/projects/${project.id}/annotations/data/for-scene/scene-missing`)
      .expect(404);

    expect(response.body.error).toBe('Scene not found');
    expect(response.body.code).toBe('annotation.scene.not_found');
  });

  it('returns 404 when scene links are requested for a missing scene', async () => {
    vi.mocked(annotationService.getAnnotationLinksForSceneAssets).mockResolvedValueOnce({
      ok: false,
      code: 'scene_not_found',
    } as never);

    const response = await request(app)
      .get(`/api/projects/${project.id}/annotations/links/for-scene/scene-missing`)
      .expect(404);

    expect(response.body.error).toBe('Scene not found');
    expect(response.body.code).toBe('annotation.scene.not_found');
  });

  it('returns the uniform error envelope for unmatched routes', async () => {
    const response = await request(app)
      .get('/api/route-that-does-not-exist')
      .expect(404);

    expect(response.body.error).toBe('Not found');
    expect(response.body.code).toBe('common.route_not_found');
    expect(response.body.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.requestId).toBeTruthy();
  });

  it('opens the annotation SSE endpoint with an optional sceneId', async () => {
    const streamId = '11111111-1111-4111-8111-111111111111';
    vi.mocked(annotationEvents.subscribeToAnnotationEvents).mockImplementation(({ response }) => {
      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream');
      response.end();

      return {
        streamId,
        close: vi.fn(),
      };
    });

    const response = await request(app)
      .get(`/api/projects/${project.id}/annotations/events`)
      .query({ sceneId: 'scene-1' })
      .expect(200);

    expect(annotationEvents.subscribeToAnnotationEvents).toHaveBeenCalledTimes(1);
    expect(annotationEvents.subscribeToAnnotationEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        sceneId: 'scene-1',
        sessionId: 'test-session',
        userId: user.id,
        username: 'annotator',
      }),
    );
    expect(response.headers['content-type']).toContain('text/event-stream');
  });

  it('accepts social-lock start notifications for a live stream', async () => {
    const streamId = '11111111-1111-4111-8111-111111111111';
    vi.mocked(annotationEvents.publishAnnotationSocialLockStart).mockReturnValue({
      ok: true,
      value: {
        type: 'annotation.social_lock.started',
        timestamp: '2026-04-25T12:00:00.000Z',
        streamId,
        projectId: project.id,
        sceneId: 'scene-1',
        sessionId: 'test-session',
        userId: user.id,
        username: 'annotator',
        resourceType: 'geometry',
        resourceId: 'ag-1',
        activity: 'editing',
        startedAt: '2026-04-25T12:00:00.000Z',
      },
    });

    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/events/social-lock/start`)
      .send({ sceneId: 'scene-1', streamId, resourceType: 'geometry', resourceId: 'ag-1', activity: 'editing' })
      .expect(202);

    expect(response.body.success).toBe(true);
    expect(response.body.event.type).toBe('annotation.social_lock.started');
    expect(annotationEvents.publishAnnotationSocialLockStart).toHaveBeenCalledWith({
      projectId: project.id,
      sceneId: 'scene-1',
      streamId,
      sessionId: 'test-session',
      userId: user.id,
      username: 'annotator',
      resourceType: 'geometry',
      resourceId: 'ag-1',
      activity: 'editing',
    });
  });

  it('rejects invalid social-lock payloads before touching the broker', async () => {
    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/events/social-lock/start`)
      .send({ sceneId: 'scene-1', streamId: '11111111-1111-4111-8111-111111111111', resourceType: 'geometry' })
      .expect(400);

    expect(response.body.error).toContain('sceneId and streamId are required');
    expect(annotationEvents.publishAnnotationSocialLockStart).not.toHaveBeenCalled();
  });

  it('maps missing streams on social-lock stop to 404', async () => {
    vi.mocked(annotationEvents.publishAnnotationSocialLockStop).mockReturnValue({
      ok: false,
      code: 'stream_not_found',
    });

    const response = await request(app)
      .post(`/api/projects/${project.id}/annotations/events/social-lock/stop`)
      .send({ sceneId: 'scene-1', streamId: '11111111-1111-4111-8111-111111111111' })
      .expect(404);

    expect(response.body.code).toBe('stream_not_found');
  });
});