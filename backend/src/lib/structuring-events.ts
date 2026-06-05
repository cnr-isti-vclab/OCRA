import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type {
  StructuringConnectedEvent,
  StructuringDrainEvent,
  StructuringDrainState,
  StructuringStreamEvent,
} from 'shared/structuring-events';

interface StructuringEventConnection {
  streamId: string;
  projectId: string;
  sessionId: string;
  userId: string;
  username: string;
  response: Response;
  heartbeat: NodeJS.Timeout;
}

interface SubscribeStructuringEventsInput {
  projectId: string;
  sessionId: string;
  userId: string;
  username: string;
  response: Response;
}

interface PublishStructuringDrainingInput {
  projectId: string;
  streamId: string;
  sessionId: string;
  userId: string;
  username: string;
  operationType: string | null;
  operationContext: Record<string, unknown> | null;
  drainTimeoutMs?: number | null;
  drainDeadlineAt?: string | null;
}

const HEARTBEAT_INTERVAL_MS = 25_000;

const connections = new Map<string, StructuringEventConnection>();
const drainingSignals = new Map<string, StructuringDrainState>();

function writeEvent(response: Response, event: StructuringStreamEvent) {
  response.write(`id: ${randomUUID()}\n`);
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function createDrainingKey(signal: Pick<StructuringDrainState, 'projectId' | 'streamId'>) {
  return `${signal.projectId}:${signal.streamId}`;
}

function getActiveDrainingSignals(projectId: string) {
  return Array.from(drainingSignals.values()).filter((signal) => signal.projectId === projectId);
}

function broadcastEvent(event: StructuringStreamEvent, projectId: string) {
  for (const connection of connections.values()) {
    if (connection.projectId !== projectId || connection.response.writableEnded) {
      continue;
    }

    writeEvent(connection.response, event);
  }
}

function closeStructuringEventConnection(streamId: string) {
  const connection = connections.get(streamId);
  if (!connection) {
    return;
  }

  clearInterval(connection.heartbeat);
  connections.delete(streamId);

  const key = createDrainingKey({ projectId: connection.projectId, streamId });
  const activeSignal = drainingSignals.get(key);
  if (!activeSignal) {
    return;
  }

  drainingSignals.delete(key);
  broadcastEvent(
    {
      ...activeSignal,
      type: 'structuring.draining.stopped',
      timestamp: new Date().toISOString(),
    },
    connection.projectId,
  );
}

export function subscribeToStructuringEvents(input: SubscribeStructuringEventsInput) {
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
    sessionId: input.sessionId,
    userId: input.userId,
    username: input.username,
    response,
    heartbeat,
  });

  const connectedEvent: StructuringConnectedEvent = {
    type: 'structuring.connected',
    timestamp: new Date().toISOString(),
    streamId,
    projectId: input.projectId,
    activeDrainingSignals: getActiveDrainingSignals(input.projectId),
  };
  writeEvent(response, connectedEvent);

  return {
    streamId,
    close: () => closeStructuringEventConnection(streamId),
  };
}

export function publishStructuringDrainingStart(input: PublishStructuringDrainingInput) {
  const connection = connections.get(input.streamId);
  if (!connection || connection.projectId !== input.projectId || connection.sessionId !== input.sessionId) {
    return { ok: false as const, code: 'stream_not_found' };
  }

  const startedAt = new Date();
  const drainDeadlineAt = input.drainDeadlineAt
    ?? (input.drainTimeoutMs && input.drainTimeoutMs > 0
      ? new Date(startedAt.getTime() + input.drainTimeoutMs).toISOString()
      : null);

  const signal: StructuringDrainState = {
    streamId: input.streamId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    userId: input.userId,
    username: input.username,
    operationType: input.operationType,
    operationContext: input.operationContext,
    startedAt: startedAt.toISOString(),
    drainDeadlineAt,
  };

  drainingSignals.set(createDrainingKey(signal), signal);

  const event: StructuringDrainEvent = {
    ...signal,
    type: 'structuring.draining.started',
    timestamp: new Date().toISOString(),
  };
  broadcastEvent(event, input.projectId);

  return { ok: true as const, value: event };
}

export function publishStructuringDrainingStop(input: PublishStructuringDrainingInput) {
  const connection = connections.get(input.streamId);
  if (!connection || connection.projectId !== input.projectId || connection.sessionId !== input.sessionId) {
    return { ok: false as const, code: 'stream_not_found' };
  }

  const key = createDrainingKey({ projectId: input.projectId, streamId: input.streamId });
  const existingSignal = drainingSignals.get(key);
  if (!existingSignal) {
    return { ok: false as const, code: 'draining_signal_not_found' };
  }

  drainingSignals.delete(key);

  const event: StructuringDrainEvent = {
    ...existingSignal,
    type: 'structuring.draining.stopped',
    timestamp: new Date().toISOString(),
  };
  broadcastEvent(event, input.projectId);

  return { ok: true as const, value: event };
}

export function resetStructuringEventBrokerForTests() {
  for (const connection of connections.values()) {
    clearInterval(connection.heartbeat);
  }

  connections.clear();
  drainingSignals.clear();
}