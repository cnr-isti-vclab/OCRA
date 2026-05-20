import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db.js', () => ({
  getPrismaClient: vi.fn(),
  getValidSession: vi.fn(),
}));

vi.mock('../services/session.service.js', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  removeSession: vi.fn(),
}));

vi.mock('../services/auth.service.js', () => ({
  logLogin: vi.fn(),
  logLogout: vi.fn(),
}));

vi.mock('../utils/audit.js', () => ({
  auditBestEffort: vi.fn(),
}));

vi.mock('../services/hdt-metadata.service.js', () => ({
  getHDTDocument: vi.fn(),
}));

import { getPrismaClient } from '../../db.js';
import { getHDTDocument } from '../services/hdt-metadata.service.js';
import { getCurrentUser, getUserSession } from '../controllers/session.controller.js';
import { getHDTMetadataHandler } from '../controllers/hdt-metadata.controller.js';
import { listProjectMembers } from '../controllers/project-members.controller.js';
import { isManagerOfProject, listProjectFiles } from '../controllers/projects.controller.js';

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.cookies = {};
    next();
  });
  app.use((req, res, next) => {
    req.requestId = 'test-request-id';
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  app.get('/sessions/current', getCurrentUser);
  app.get('/sessions', getUserSession);
  app.get('/projects/:projectId/is-manager', isManagerOfProject);
  app.get('/projects/:projectId/files', listProjectFiles);
  app.get('/projects/:projectId/members', listProjectMembers);
  app.get('/projects/:projectId/hdt', (req, _res, next) => {
    req.user = {
      id: 'user-1',
      sub: 'user-1-sub',
      email: 'annotator@example.com',
      username: 'annotator',
      sys_admin: false,
    } as any;
    next();
  }, getHDTMetadataHandler);

  return app;
}

describe('uniform API error envelope', () => {
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

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
    prismaMock.structuringLock.findUnique.mockResolvedValue(null);
  });

  it('returns a structured 401 envelope for current session without credentials', async () => {
    const app = buildTestApp();

    const response = await request(app)
      .get('/sessions/current')
      .expect(401);

    expect(response.body).toMatchObject({
      success: false,
      error: 'No session provided',
      code: 'session.no_session_provided',
      status: 401,
      requestId: 'test-request-id',
    });
  });

  it('returns a structured 400 envelope when sessionId is missing', async () => {
    const app = buildTestApp();

    const response = await request(app)
      .get('/sessions')
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: 'Session ID required',
      code: 'session.id_required',
      status: 400,
    });
  });

  it('returns a structured 401 envelope for project manager checks without authentication', async () => {
    const app = buildTestApp();

    const response = await request(app)
      .get('/projects/project-1/is-manager')
      .expect(401);

    expect(response.body).toMatchObject({
      success: false,
      error: 'Authentication required',
      code: 'project.authentication_required',
      status: 401,
    });
  });

  it('returns a structured 404 envelope when listing files for a missing project', async () => {
    prismaMock.project.findUnique.mockResolvedValue(null);
    const app = buildTestApp();

    const response = await request(app)
      .get('/projects/project-missing/files')
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      error: 'Project not found',
      code: 'project.not_found',
      status: 404,
    });
  });

  it('returns a structured 401 envelope for project member listing without authentication', async () => {
    const app = buildTestApp();

    const response = await request(app)
      .get('/projects/project-1/members')
      .expect(401);

    expect(response.body).toMatchObject({
      success: false,
      error: 'Authentication required',
      code: 'project_member.authentication_required',
      status: 401,
    });
  });

  it('returns a structured 404 envelope when HDT metadata is missing', async () => {
    vi.mocked(getHDTDocument).mockResolvedValue(null as never);
    const app = buildTestApp();

    const response = await request(app)
      .get('/projects/project-1/hdt')
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      error: 'HDT document not found for this project',
      code: 'hdt.document_not_found',
      status: 404,
    });
  });
});