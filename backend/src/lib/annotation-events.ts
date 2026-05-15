import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type {
  AnnotationConnectedEvent,
  AnnotationImpactMetadata,
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
  sceneId: string | null;
  streamId: string;
  sessionId: string;
  userId: string;
  username: string;
  resourceType: 'geometry' | 'data' | 'link' | null;
  resourceId: string | null;
  activity: string | null;
  impact: AnnotationImpactMetadata;
}

const HEARTBEAT_INTERVAL_MS = 25_000;

const connections = new Map<string, AnnotationEventConnection>();
const socialLocks = new Map<string, AnnotationSocialLockState>();

function createSocialLockKey(lock: Pick<AnnotationSocialLockState, 'projectId' | 'streamId' | 'resourceType' | 'resourceId' | 'impact'>) {
  return [
    lock.projectId,
    lock.impact.originScopeType,
    lock.impact.originScopeId ?? '-',
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

function eventImpact(event: AnnotationStreamEvent): AnnotationImpactMetadata | null {
  if (event.type === 'annotation.connected') {
    return null;
  }

  return event.impact;
}

function matchesImpactAudience(connection: Pick<AnnotationEventConnection, 'sceneId'>, impact: AnnotationImpactMetadata | null) {
  if (!impact || connection.sceneId === null) {
    return true;
  }

  if (impact.originScopeType === 'scene' && impact.originScopeId === connection.sceneId) {
    return true;
  }

  return impact.affectedSceneIds.includes(connection.sceneId);
}

function matchesAudience(connection: AnnotationEventConnection, projectId: string, impact: AnnotationImpactMetadata | null) {
  return connection.projectId === projectId && matchesImpactAudience(connection, impact);
}

function broadcastEvent(event: AnnotationStreamEvent, projectId: string) {
  const impact = eventImpact(event);

  for (const connection of connections.values()) {
    if (!matchesAudience(connection, projectId, impact) || connection.response.writableEnded) {
      continue;
    }

    writeEvent(connection.response, event);
  }
}

function getActiveSocialLocks(projectId: string, sceneId: string | null) {
  return Array.from(socialLocks.values()).filter((lock) => {
    return lock.projectId === projectId && matchesImpactAudience({ sceneId }, lock.impact);
  });
}

function closeAnnotationEventConnection(streamId: string) {
  const connection = connections.get(streamId);
  if (!connection) {
    return;
  }

  clearInterval(connection.heartbeat);
  connections.delete(streamId);

  if (!connection.response.writableEnded) {
    connection.response.end();
  }

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
    );
  }
}

export function closeAnnotationEventConnectionsForProject(projectId: string, ownerSessionId: string) {
  for (const connection of connections.values()) {
    if (connection.projectId !== projectId || connection.sessionId === ownerSessionId) {
      continue;
    }

    closeAnnotationEventConnection(connection.streamId);
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
    impact: input.impact,
  };

  socialLocks.set(createSocialLockKey(lock), lock);

  const event: AnnotationSocialLockEvent = {
    ...lock,
    type: 'annotation.social_lock.started',
    timestamp: new Date().toISOString(),
  };
  broadcastEvent(event, input.projectId);

  return { ok: true as const, value: event };
}

export function publishAnnotationSocialLockStop(input: PublishAnnotationSocialLockInput) {
  const connection = connections.get(input.streamId);
  if (!connection || connection.projectId !== input.projectId || connection.sessionId !== input.sessionId) {
    return { ok: false as const, code: 'stream_not_found' };
  }

  const key = createSocialLockKey({
    projectId: input.projectId,
    streamId: input.streamId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    impact: input.impact,
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
  broadcastEvent(event, input.projectId);

  return { ok: true as const, value: event };
}

export function publishAnnotationMutation(event: AnnotationMutationEvent) {
  broadcastEvent(event, event.projectId);
}

export function resetAnnotationEventBrokerForTests() {
  for (const connection of connections.values()) {
    clearInterval(connection.heartbeat);
  }

  connections.clear();
  socialLocks.clear();
}