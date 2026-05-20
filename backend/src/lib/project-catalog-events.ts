import { randomUUID } from 'crypto';
import type { Response } from 'express';

type ProjectCatalogChangeType = 'created' | 'updated' | 'deleted';

interface ProjectCatalogConnection {
  streamId: string;
  response: Response;
  heartbeat: NodeJS.Timeout;
}

interface ProjectCatalogConnectedEvent {
  type: 'project.catalog.connected';
  timestamp: string;
  streamId: string;
}

interface ProjectCatalogChangedEvent {
  type: 'project.catalog.changed';
  timestamp: string;
  projectId: string;
  changeType: ProjectCatalogChangeType;
}

type ProjectCatalogStreamEvent = ProjectCatalogConnectedEvent | ProjectCatalogChangedEvent;

const HEARTBEAT_INTERVAL_MS = 25_000;
const connections = new Map<string, ProjectCatalogConnection>();

function writeEvent(response: Response, event: ProjectCatalogStreamEvent) {
  response.write(`id: ${randomUUID()}\n`);
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function closeProjectCatalogConnection(streamId: string) {
  const connection = connections.get(streamId);
  if (!connection) {
    return;
  }

  clearInterval(connection.heartbeat);
  connections.delete(streamId);
}

export function subscribeToProjectCatalogEvents(response: Response) {
  const streamId = randomUUID();

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
    response,
    heartbeat,
  });

  writeEvent(response, {
    type: 'project.catalog.connected',
    timestamp: new Date().toISOString(),
    streamId,
  });

  return {
    streamId,
    close: () => closeProjectCatalogConnection(streamId),
  };
}

export function publishProjectCatalogChanged(projectId: string, changeType: ProjectCatalogChangeType) {
  const event: ProjectCatalogChangedEvent = {
    type: 'project.catalog.changed',
    timestamp: new Date().toISOString(),
    projectId,
    changeType,
  };

  for (const connection of connections.values()) {
    if (connection.response.writableEnded) {
      continue;
    }

    writeEvent(connection.response, event);
  }
}

export function resetProjectCatalogEventBrokerForTests() {
  for (const connection of connections.values()) {
    clearInterval(connection.heartbeat);
  }

  connections.clear();
}