import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeAnnotationEventConnectionsForProject,
  publishAnnotationMutation,
  publishAnnotationSocialLockStart,
  resetAnnotationEventBrokerForTests,
  subscribeToAnnotationEvents,
} from '../lib/annotation-events.js';

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
      end: vi.fn(function end(this: any) {
        (this as any).writableEnded = true;
        return this;
      }),
    },
  };
}

describe.sequential('annotation event broker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAnnotationEventBrokerForTests();
  });

  afterEach(() => {
    resetAnnotationEventBrokerForTests();
    vi.useRealTimers();
  });

  it('opens an SSE stream with no-cache headers and a connected payload', () => {
    const client = createMockResponse();

    subscribeToAnnotationEvents({
      projectId: 'project-1',
      sceneId: 'scene-1',
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'annotator',
      response: client.response as never,
    });

    expect(client.response.status).toHaveBeenCalledWith(200);
    expect(client.headers.get('Content-Type')).toBe('text/event-stream');
    expect(client.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(client.writes.join('')).toContain('event: annotation.connected');
    expect(client.writes.join('')).toContain('retry: 5000');
  });

  it('broadcasts social-lock events and mutation events only to the matching audience', () => {
    const sceneClient = createMockResponse();
    const otherSceneClient = createMockResponse();
    const unrelatedSceneClient = createMockResponse();
    const projectWideClient = createMockResponse();

    const sceneSubscription = subscribeToAnnotationEvents({
      projectId: 'project-1',
      sceneId: 'scene-1',
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'annotator',
      response: sceneClient.response as never,
    });
    subscribeToAnnotationEvents({
      projectId: 'project-1',
      sceneId: 'scene-2',
      sessionId: 'session-2',
      userId: 'user-2',
      username: 'reviewer',
      response: otherSceneClient.response as never,
    });
    subscribeToAnnotationEvents({
      projectId: 'project-1',
      sceneId: 'scene-3',
      sessionId: 'session-4',
      userId: 'user-4',
      username: 'observer',
      response: unrelatedSceneClient.response as never,
    });
    subscribeToAnnotationEvents({
      projectId: 'project-1',
      sceneId: null,
      sessionId: 'session-3',
      userId: 'user-3',
      username: 'manager',
      response: projectWideClient.response as never,
    });

    const lockResult = publishAnnotationSocialLockStart({
      projectId: 'project-1',
      sceneId: 'scene-1',
      streamId: sceneSubscription.streamId,
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'annotator',
      resourceType: 'geometry',
      resourceId: 'ag-1',
      activity: 'editing',
      impact: {
        originScopeType: 'scene',
        originScopeId: 'scene-1',
        affectedSceneIds: ['scene-1'],
        affectedAssetIds: [],
      },
    });

    expect(lockResult.ok).toBe(true);
    expect(sceneClient.writes.join('')).toContain('annotation.social_lock.started');
    expect(projectWideClient.writes.join('')).toContain('annotation.social_lock.started');
    expect(otherSceneClient.writes.join('')).not.toContain('annotation.social_lock.started');
    expect(unrelatedSceneClient.writes.join('')).not.toContain('annotation.social_lock.started');

    publishAnnotationMutation({
      type: 'annotation.mutated',
      timestamp: new Date().toISOString(),
      projectId: 'project-1',
      sceneId: 'scene-1',
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'annotator',
      mutation: 'geometry.updated',
      impact: {
        originScopeType: 'asset',
        originScopeId: 'asset-1',
        affectedSceneIds: ['scene-1', 'scene-2'],
        affectedAssetIds: ['asset-1'],
      },
      entity: {
        kind: 'geometry',
        id: 'ag-1',
        version: 2,
        referenceType: 'asset',
        referenceId: 'asset-1',
        erasable: false,
      },
    });

    expect(sceneClient.writes.join('')).toContain('geometry.updated');
    expect(projectWideClient.writes.join('')).toContain('geometry.updated');
    expect(otherSceneClient.writes.join('')).toContain('geometry.updated');
    expect(unrelatedSceneClient.writes.join('')).not.toContain('geometry.updated');
  });

  it('expires social locks when the owning stream disconnects', () => {
    const ownerClient = createMockResponse();
    const watcherClient = createMockResponse();

    const ownerSubscription = subscribeToAnnotationEvents({
      projectId: 'project-1',
      sceneId: 'scene-1',
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'annotator',
      response: ownerClient.response as never,
    });
    subscribeToAnnotationEvents({
      projectId: 'project-1',
      sceneId: 'scene-1',
      sessionId: 'session-2',
      userId: 'user-2',
      username: 'watcher',
      response: watcherClient.response as never,
    });

    publishAnnotationSocialLockStart({
      projectId: 'project-1',
      sceneId: 'scene-1',
      streamId: ownerSubscription.streamId,
      sessionId: 'session-1',
      userId: 'user-1',
      username: 'annotator',
      resourceType: 'data',
      resourceId: 'ad-1',
      activity: 'editing',
      impact: {
        originScopeType: 'scene',
        originScopeId: 'scene-1',
        affectedSceneIds: ['scene-1'],
        affectedAssetIds: [],
      },
    });

    ownerSubscription.close();

    expect(watcherClient.writes.join('')).toContain('annotation.social_lock.stopped');
  });

  it('force-closes non-owner annotation streams for the locked project', () => {
    const ownerClient = createMockResponse();
    const watcherClient = createMockResponse();
    const otherProjectClient = createMockResponse();

    subscribeToAnnotationEvents({
      projectId: 'project-1',
      sceneId: 'scene-1',
      sessionId: 'session-owner',
      userId: 'user-1',
      username: 'owner',
      response: ownerClient.response as never,
    });
    subscribeToAnnotationEvents({
      projectId: 'project-1',
      sceneId: 'scene-1',
      sessionId: 'session-watcher',
      userId: 'user-2',
      username: 'watcher',
      response: watcherClient.response as never,
    });
    subscribeToAnnotationEvents({
      projectId: 'project-2',
      sceneId: 'scene-9',
      sessionId: 'session-other',
      userId: 'user-3',
      username: 'other-project',
      response: otherProjectClient.response as never,
    });

    closeAnnotationEventConnectionsForProject('project-1', 'session-owner');

    expect(ownerClient.response.end).not.toHaveBeenCalled();
    expect(watcherClient.response.end).toHaveBeenCalledTimes(1);
    expect(otherProjectClient.response.end).not.toHaveBeenCalled();
  });
});