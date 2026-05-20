import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  publishStructuringDrainingStart,
  resetStructuringEventBrokerForTests,
  subscribeToStructuringEvents,
} from '../lib/structuring-events.js';

function createMockResponse() {
  const writes: string[] = [];
  const headers = new Map<string, string>();

  return {
    writes,
    headers,
    response: {
      writableEnded: false,
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn((name: string, value: string) => {
        headers.set(name, value);
      }),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => {
        writes.push(chunk);
        return true;
      }),
    },
  };
}

describe.sequential('structuring event broker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStructuringEventBrokerForTests();
  });

  afterEach(() => {
    resetStructuringEventBrokerForTests();
    vi.useRealTimers();
  });

  it('opens an SSE stream with no-cache headers and a connected payload', () => {
    const client = createMockResponse();

    subscribeToStructuringEvents({
      projectId: 'project-1',
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'manager',
      response: client.response as never,
    });

    expect(client.response.status).toHaveBeenCalledWith(200);
    expect(client.headers.get('Content-Type')).toBe('text/event-stream');
    expect(client.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(client.writes.join('')).toContain('event: structuring.connected');
    expect(client.writes.join('')).toContain('retry: 5000');
  });

  it('broadcasts draining events to all project subscribers', () => {
    const ownerClient = createMockResponse();
    const watcherClient = createMockResponse();
    const otherProjectClient = createMockResponse();

    const ownerSubscription = subscribeToStructuringEvents({
      projectId: 'project-1',
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'manager',
      response: ownerClient.response as never,
    });
    subscribeToStructuringEvents({
      projectId: 'project-1',
      sessionId: 'session-2',
      userId: 'user-2',
      username: 'viewer',
      response: watcherClient.response as never,
    });
    subscribeToStructuringEvents({
      projectId: 'project-2',
      sessionId: 'session-3',
      userId: 'user-3',
      username: 'other',
      response: otherProjectClient.response as never,
    });

    const result = publishStructuringDrainingStart({
      projectId: 'project-1',
      streamId: ownerSubscription.streamId,
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'manager',
      operationType: 'scene.delete',
      operationContext: { sceneId: 'scene-1' },
    });

    expect(result.ok).toBe(true);
    expect(ownerClient.writes.join('')).toContain('structuring.draining.started');
    expect(watcherClient.writes.join('')).toContain('structuring.draining.started');
    expect(otherProjectClient.writes.join('')).not.toContain('structuring.draining.started');
  });

  it('expires draining signals when the owning stream disconnects', () => {
    const ownerClient = createMockResponse();
    const watcherClient = createMockResponse();

    const ownerSubscription = subscribeToStructuringEvents({
      projectId: 'project-1',
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'manager',
      response: ownerClient.response as never,
    });
    subscribeToStructuringEvents({
      projectId: 'project-1',
      sessionId: 'session-2',
      userId: 'user-2',
      username: 'viewer',
      response: watcherClient.response as never,
    });

    publishStructuringDrainingStart({
      projectId: 'project-1',
      streamId: ownerSubscription.streamId,
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'manager',
      operationType: 'project.delete',
      operationContext: null,
    });

    ownerSubscription.close();

    expect(watcherClient.writes.join('')).toContain('structuring.draining.stopped');
  });
});