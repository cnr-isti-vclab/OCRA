import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db.js', () => ({
  getPrismaClient: vi.fn(),
}));

import { getPrismaClient } from '../../db.js';
import { enforceStructuringLock } from '../middleware/project-structuring-lock.js';

function buildApp(sessionId?: string) {
  const app = express();
  app.use((req, _res, next) => {
    req.requestId = 'test-request-id';
    req.sessionId = sessionId;
    next();
  });
  app.get('/projects/:projectId/resource', enforceStructuringLock, (req, res) => {
    res.json({ success: true, sessionId: req.sessionId ?? null });
  });
  return app;
}

describe('enforceStructuringLock middleware', () => {
  const prismaMock = {
    structuringLock: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
  });

  it('allows access when no active lock exists', async () => {
    prismaMock.structuringLock.findUnique.mockResolvedValue(null);
    const app = buildApp();

    const response = await request(app)
      .get('/projects/project-1/resource')
      .expect(200);

    expect(response.body).toMatchObject({ success: true, sessionId: null });
  });

  it('rejects access when another session owns an active lock', async () => {
    prismaMock.structuringLock.findUnique.mockResolvedValue({
      ownerSessionId: 'owner-session',
      heartbeatExpiresAt: new Date(Date.now() + 15_000),
      releasedAt: null,
    });
    const app = buildApp();

    const response = await request(app)
      .get('/projects/project-1/resource')
      .expect(423);

    expect(response.body).toMatchObject({
      success: false,
      code: 'structuring.project_locked',
      error: 'Project is locked by another structuring session',
      status: 423,
    });
  });

  it('allows access to the owner session', async () => {
    prismaMock.structuringLock.findUnique.mockResolvedValue({
      ownerSessionId: 'owner-session',
      heartbeatExpiresAt: new Date(Date.now() + 15_000),
      releasedAt: null,
    });
    const app = buildApp('owner-session');

    const response = await request(app)
      .get('/projects/project-1/resource')
      .expect(200);

    expect(response.body).toMatchObject({ success: true, sessionId: 'owner-session' });
  });
});