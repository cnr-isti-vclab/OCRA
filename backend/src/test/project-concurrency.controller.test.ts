import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn((req, _res, next) => {
    req.user = {
      id: 'user-1',
      sub: 'user-1-sub',
      email: 'manager@example.com',
      username: 'manager',
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

vi.mock('../services/project-concurrency.service.js', () => ({
  heartbeatProjectPresence: vi.fn(),
  heartbeatStructuringLock: vi.fn(),
  isKnownApiError: vi.fn(() => false),
  startProjectPresence: vi.fn(),
  startStructuringLock: vi.fn(),
  stopProjectPresence: vi.fn(),
  stopStructuringLock: vi.fn(),
}));

vi.mock('../lib/structuring-events.js', () => ({
  publishStructuringDrainingStart: vi.fn(),
  publishStructuringDrainingStop: vi.fn(),
  subscribeToStructuringEvents: vi.fn(),
}));

vi.mock('../lib/annotation-events.js', () => ({
  closeAnnotationEventConnectionsForProject: vi.fn(),
}));

vi.mock('../middleware/project-structuring-lock.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/project-structuring-lock.js')>('../middleware/project-structuring-lock.js');
  return {
    ...actual,
    requireOwnedStructuringLock: vi.fn(),
  };
});

import { getPrismaClient } from '../../db.js';
import { createApp } from '../app.js';
import { closeAnnotationEventConnectionsForProject } from '../lib/annotation-events.js';
import * as structuringEvents from '../lib/structuring-events.js';
import { requireOwnedStructuringLock } from '../middleware/project-structuring-lock.js';
import { heartbeatStructuringLock, startStructuringLock } from '../services/project-concurrency.service.js';

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

describe.sequential('Project concurrency controller SSE endpoints', () => {
  beforeEach(() => {
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
    prismaMock.project.findUnique.mockResolvedValue({ public: false });
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', sys_admin: false });
    prismaMock.projectRole.findFirst.mockResolvedValue({ id: 'role-1' });
    vi.mocked(requireOwnedStructuringLock).mockResolvedValue(true);
  });

  it('opens the structuring SSE endpoint', async () => {
    const streamId = '11111111-1111-4111-8111-111111111111';
    vi.mocked(structuringEvents.subscribeToStructuringEvents).mockImplementation(({ response }) => {
      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream');
      response.end();

      return {
        streamId,
        close: vi.fn(),
      };
    });

    const response = await request(app)
      .get('/api/projects/project-1/structuring/events')
      .expect(200);

    expect(structuringEvents.subscribeToStructuringEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        sessionId: 'test-session',
        userId: 'user-1',
        username: 'manager',
      }),
    );
    expect(response.headers['content-type']).toContain('text/event-stream');
  });

  it('accepts structuring draining start notifications for an active owner stream', async () => {
    const streamId = '11111111-1111-4111-8111-111111111111';
    vi.mocked(structuringEvents.publishStructuringDrainingStart).mockReturnValue({
      ok: true,
      value: {
        type: 'structuring.draining.started',
        timestamp: '2026-04-26T12:00:00.000Z',
        streamId,
        projectId: 'project-1',
        sessionId: 'test-session',
        userId: 'user-1',
        username: 'manager',
        operationType: 'scene.delete',
        operationContext: { sceneId: 'scene-1' },
        startedAt: '2026-04-26T12:00:00.000Z',
      },
    });

    const response = await request(app)
      .post('/api/projects/project-1/structuring/events/draining/start')
      .send({ streamId, operationType: 'scene.delete', operationContext: { sceneId: 'scene-1' } })
      .expect(202);

    expect(response.body.success).toBe(true);
    expect(response.body.event.type).toBe('structuring.draining.started');
    expect(structuringEvents.publishStructuringDrainingStart).toHaveBeenCalledWith({
      projectId: 'project-1',
      streamId,
      sessionId: 'test-session',
      userId: 'user-1',
      username: 'manager',
      operationType: 'scene.delete',
      operationContext: { sceneId: 'scene-1' },
    });
    expect(closeAnnotationEventConnectionsForProject).not.toHaveBeenCalled();
  });

  it('closes annotation streams when structuring starts directly in exclusive state', async () => {
    vi.mocked(startStructuringLock).mockResolvedValue({
      state: 'exclusive',
      projectId: 'project-1',
      ownerSessionId: 'test-session',
      fencingToken: 7,
      heartbeatExpiresAt: new Date('2026-04-26T12:00:15.000Z'),
      remainingPresenceCount: 0,
    } as never);

    const response = await request(app)
      .post('/api/projects/project-1/structuring/start')
      .send({ operationType: 'project.delete' })
      .expect(200);

    expect(response.body.state).toBe('exclusive');
    expect(closeAnnotationEventConnectionsForProject).toHaveBeenCalledWith('project-1', 'test-session');
  });

  it('closes annotation streams when heartbeat promotes structuring to exclusive', async () => {
    vi.mocked(heartbeatStructuringLock).mockResolvedValue({
      state: 'exclusive',
      projectId: 'project-1',
      fencingToken: 7,
      heartbeatExpiresAt: new Date('2026-04-26T12:00:15.000Z'),
      remainingPresenceCount: 0,
    } as never);

    const response = await request(app)
      .post('/api/projects/project-1/structuring/heartbeat')
      .send({ fencingToken: 7 })
      .expect(200);

    expect(response.body.state).toBe('exclusive');
    expect(closeAnnotationEventConnectionsForProject).toHaveBeenCalledWith('project-1', 'test-session');
  });

  it('rejects invalid structuring draining payloads before touching the broker', async () => {
    const response = await request(app)
      .post('/api/projects/project-1/structuring/events/draining/start')
      .send({ operationType: 'scene.delete' })
      .expect(400);

    expect(response.body.error).toContain('streamId is required');
    expect(structuringEvents.publishStructuringDrainingStart).not.toHaveBeenCalled();
  });

  it('maps missing structuring streams on draining stop to 404', async () => {
    vi.mocked(structuringEvents.publishStructuringDrainingStop).mockReturnValue({
      ok: false,
      code: 'stream_not_found',
    });

    const response = await request(app)
      .post('/api/projects/project-1/structuring/events/draining/stop')
      .send({ streamId: '11111111-1111-4111-8111-111111111111' })
      .expect(404);

    expect(response.body.error).toContain('Structuring draining signal is not available');
  });
});