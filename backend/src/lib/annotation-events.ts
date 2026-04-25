import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type {
  AnnotationConnectedEvent,
  AnnotationMutationEvent,
  AnnotationSocialLockEvent,
  AnnotationSocialLockState,
  AnnotationStreamEvent,
} from 'shared/annotation-events';

interface AnnotationEventConnection {
  streamId: string;
  projectId: string;
  sceneId: string | null;
  sessionId: string;
  userId: string;
  username: string;
  response: Response;
  heartbeat: NodeJS.Timeout;
}

interface SubscribeAnnotationEventsInput {
  projectId: string;
  sceneId: string | null;
  sessionId: string;
  userId: string;
  username: string;
  response: Response;
}

interface PublishAnnotationSocialLockInput {
  projectId: string;
  sceneId: string;
  streamId: string;
  sessionId: string;
  userId: string;
  username: string;
  resourceType: 'geometry' | 'data' | 'link' | null;
  resourceId: string | null;
  activity: string | null;
}

const HEARTBEAT_INTERVAL_MS = 25_000;

const connections = new Map<string, AnnotationEventConnection>();
const socialLocks = new Map<string, AnnotationSocialLockState>();

function createSocialLockKey(lock: Pick<AnnotationSocialLockState, 'projectId' | 'sceneId' | 'streamId' | 'resourceType' | 'resourceId'>) {
  return [
    lock.projectId,
    lock.sceneId,
    lock.streamId,
    lock.resourceType ?? '-',
    lock.resourceId ?? '-',
  ].join(':');
}

function writeEvent(response: Response, event: AnnotationStreamEvent) {
  response.write(`id: ${randomUUID()}\n`);
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function matchesAudience(connection: AnnotationEventConnection, projectId: string, sceneId: string | null) {
  if (connection.projectId !== projectId) {
    return false;
  }

  if (sceneId === null) {
    return true;
  }

  return connection.sceneId === null || connection.sceneId === sceneId;
}

function broadcastEvent(event: AnnotationStreamEvent, projectId: string, sceneId: string | null) {
  for (const connection of connections.values()) {
    if (!matchesAudience(connection, projectId, sceneId) || connection.response.writableEnded) {
      continue;
    }

    writeEvent(connection.response, event);
  }
}

function getActiveSocialLocks(projectId: string, sceneId: string | null) {
  return Array.from(socialLocks.values()).filter((lock) => {
    if (lock.projectId !== projectId) {
      return false;
    }

    return sceneId === null || lock.sceneId === sceneId;
  });
}

function closeAnnotationEventConnection(streamId: string) {
  const connection = connections.get(streamId);
  if (!connection) {
    return;
  }

  clearInterval(connection.heartbeat);
  connections.delete(streamId);

  const stoppedLocks = Array.from(socialLocks.values()).filter((lock) => lock.streamId === streamId);
  for (const lock of stoppedLocks) {
    socialLocks.delete(createSocialLockKey(lock));
    broadcastEvent(
      {
        ...lock,
        type: 'annotation.social_lock.stopped',
        timestamp: new Date().toISOString(),
      },
      lock.projectId,
      lock.sceneId,
    );
  }
}

export function subscribeToAnnotationEvents(input: SubscribeAnnotationEventsInput) {
  const streamId = randomUUID();
  const response = input.response;

  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
  response.write('retry: 5000\n\n');

  const heartbeat = setInterval(() => {
    if (!response.writableEnded) {
      response.write(`: keep-alive ${Date.now()}\n\n`);
    }
  }, HEARTBEAT_INTERVAL_MS);

  connections.set(streamId, {
    streamId,
    projectId: input.projectId,
    sceneId: input.sceneId,
    sessionId: input.sessionId,
    userId: input.userId,
    username: input.username,
    response,
    heartbeat,
  });

  writeEvent(response, {
    type: 'annotation.connected',
    timestamp: new Date().toISOString(),
    streamId,
    projectId: input.projectId,
    sceneId: input.sceneId,
    activeSocialLocks: getActiveSocialLocks(input.projectId, input.sceneId),
  });

  return {
    streamId,
    close: () => closeAnnotationEventConnection(streamId),
  };
}

export function publishAnnotationSocialLockStart(input: PublishAnnotationSocialLockInput) {
  const connection = connections.get(input.streamId);
  if (!connection || connection.projectId !== input.projectId || connection.sessionId !== input.sessionId) {
    return { ok: false as const, code: 'stream_not_found' };
  }

  if (connection.sceneId !== null && connection.sceneId !== input.sceneId) {
    return { ok: false as const, code: 'stream_scene_mismatch' };
  }

  const lock: AnnotationSocialLockState = {
    streamId: input.streamId,
    projectId: input.projectId,
    sceneId: input.sceneId,
    sessionId: input.sessionId,
    userId: input.userId,
    username: input.username,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    activity: input.activity,
    startedAt: new Date().toISOString(),
  };

  socialLocks.set(createSocialLockKey(lock), lock);

  const event: AnnotationSocialLockEvent = {
    ...lock,
    type: 'annotation.social_lock.started',
    timestamp: new Date().toISOString(),
  };
  broadcastEvent(event, input.projectId, input.sceneId);

  return { ok: true as const, value: event };
}

export function publishAnnotationSocialLockStop(input: PublishAnnotationSocialLockInput) {
  const connection = connections.get(input.streamId);
  if (!connection || connection.projectId !== input.projectId || connection.sessionId !== input.sessionId) {
    return { ok: false as const, code: 'stream_not_found' };
  }

  if (connection.sceneId !== null && connection.sceneId !== input.sceneId) {
    return { ok: false as const, code: 'stream_scene_mismatch' };
  }

  const key = createSocialLockKey({
    projectId: input.projectId,
    sceneId: input.sceneId,
    streamId: input.streamId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
  });
  const existingLock = socialLocks.get(key);
  if (!existingLock) {
    return { ok: false as const, code: 'social_lock_not_found' };
  }

  socialLocks.delete(key);
  const event: AnnotationSocialLockEvent = {
    ...existingLock,
    type: 'annotation.social_lock.stopped',
    timestamp: new Date().toISOString(),
  };
  broadcastEvent(event, input.projectId, input.sceneId);

  return { ok: true as const, value: event };
}

export function publishAnnotationMutation(event: AnnotationMutationEvent) {
  broadcastEvent(event, event.projectId, event.sceneId);
}

export function resetAnnotationEventBrokerForTests() {
  for (const connection of connections.values()) {
    clearInterval(connection.heartbeat);
  }

  connections.clear();
  socialLocks.clear();
}