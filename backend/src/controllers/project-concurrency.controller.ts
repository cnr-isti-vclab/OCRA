import type { Request, Response } from 'express';
import { ProjectConcurrencyMode, RoleEnum } from '@prisma/client';
import { getPrismaClient } from '../../db.js';
import { sendApiError } from '../lib/api-error.js';
import { API_ERROR_CODES } from '../lib/api-error-codes.js';
import { closeAnnotationEventConnectionsForProject } from '../lib/annotation-events.js';
import {
  publishStructuringDrainingStart,
  publishStructuringDrainingStop,
  subscribeToStructuringEvents,
} from '../lib/structuring-events.js';
import { publishProjectCatalogChanged } from '../lib/project-catalog-events.js';
import { requireOwnedStructuringLock } from '../middleware/project-structuring-lock.js';
import {
  heartbeatProjectPresence,
  heartbeatStructuringLock,
  isKnownApiError,
  startProjectPresence,
  startStructuringLock,
  stopProjectPresence,
  stopStructuringLock,
} from '../services/project-concurrency.service.js';

async function userHasProjectRole(userId: string, projectId: string, allowedRoles: RoleEnum[]) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (user.sys_admin) return true;

  const role = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId,
      role: { in: allowedRoles },
    },
  });

  return !!role;
}

async function requireProjectRole(
  req: Request,
  res: Response,
  projectId: string,
  allowedRoles: RoleEnum[],
) {
  if (!req.user?.id) {
    sendApiError(req, res, {
      status: 401,
      code: API_ERROR_CODES.common.authenticationRequired,
      error: 'Authentication required',
    });
    return null;
  }

  const allowed = await userHasProjectRole(req.user.id, projectId, allowedRoles);
  if (!allowed) {
    sendApiError(req, res, {
      status: 403,
      code: API_ERROR_CODES.common.accessDenied,
      error: 'Access denied',
    });
    return null;
  }

  return req.user;
}

function requireAuthenticatedContext(req: Request, res: Response, domain: 'structuring' | 'presence') {
  if (!req.user?.id || !req.sessionId) {
    sendApiError(req, res, {
      status: 401,
      code: API_ERROR_CODES[domain].authenticationRequired,
      error: 'Authentication required',
    });
    return null;
  }

  return {
    userId: req.user.id,
    isSysAdmin: !!req.user.sys_admin,
    sessionId: req.sessionId,
  };
}

function parseFencingToken(req: Request, res: Response) {
  const value = req.body?.fencingToken;
  if (!Number.isInteger(value)) {
    sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.invalidFencingToken,
      error: 'fencingToken must be an integer',
    });
    return null;
  }

  return value as number;
}

function parseOptionalString(
  req: Request,
  res: Response,
  value: unknown,
  code: string,
  fieldName: string,
) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    sendApiError(req, res, {
      status: 400,
      code: code as any,
      error: `${fieldName} must be a string`,
    });
    return null;
  }

  return value;
}

function parsePresencePayload(req: Request, res: Response) {
  const rawMode = req.body?.mode;
  if (!Object.values(ProjectConcurrencyMode).includes(rawMode)) {
    sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.presence.invalidMode,
      error: 'mode must be one of viewing, editing, or structuring',
    });
    return null;
  }

  const sceneId = parseOptionalString(req, res, req.body?.sceneId, API_ERROR_CODES.presence.invalidSceneId, 'sceneId');
  if (sceneId === null) {
    return null;
  }

  const clientInstanceId = parseOptionalString(
    req,
    res,
    req.body?.clientInstanceId,
    API_ERROR_CODES.presence.invalidClientInstanceId,
    'clientInstanceId',
  );
  if (clientInstanceId === null) {
    return null;
  }

  return {
    mode: rawMode,
    sceneId,
    clientInstanceId,
  };
}

function parseStructuringDrainPayload(req: Request, res: Response) {
  const streamId = parseOptionalString(
    req,
    res,
    req.body?.streamId,
    API_ERROR_CODES.structuring.invalidOperationContext,
    'streamId',
  );
  if (streamId === null) {
    return null;
  }

  if (!streamId) {
    sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.invalidOperationContext,
      error: 'streamId is required',
    });
    return null;
  }

  const operationType = parseOptionalString(
    req,
    res,
    req.body?.operationType,
    API_ERROR_CODES.structuring.invalidOperationType,
    'operationType',
  );
  if (operationType === null) {
    return null;
  }

  const operationContext = req.body?.operationContext;
  if (
    operationContext !== undefined
    && (typeof operationContext !== 'object' || operationContext === null || Array.isArray(operationContext))
  ) {
    sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.invalidOperationContext,
      error: 'operationContext must be an object',
    });
    return null;
  }

  return {
    streamId,
    operationType,
    operationContext: (operationContext as Record<string, unknown> | undefined) ?? undefined,
  };
}

function getActorUsername(req: Request) {
  return req.user?.username || req.user?.email || req.user?.sub || req.user?.id || 'unknown-user';
}

export async function subscribeStructuringEvents(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.projectIdRequired,
      error: 'Project ID is required',
    });
  }

  const currentUser = await requireProjectRole(req, res, projectId, [
    RoleEnum.viewer,
    RoleEnum.editor,
    RoleEnum.manager,
  ]);
  if (!currentUser?.id || !req.sessionId) {
    return;
  }

  try {
    const subscription = subscribeToStructuringEvents({
      projectId,
      sessionId: req.sessionId,
      userId: currentUser.id,
      username: getActorUsername(req),
      response: res,
    });

    let closed = false;
    const cleanup = () => {
      if (closed) {
        return;
      }

      closed = true;
      subscription.close();
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
  } catch (error) {
    return sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.common.internalError,
      error: 'Failed to subscribe to structuring events',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function notifyStructuringDrainingStart(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.projectIdRequired,
      error: 'Project ID is required',
    });
  }

  const auth = requireAuthenticatedContext(req, res, 'structuring');
  if (!auth) {
    return;
  }

  if (!(await requireOwnedStructuringLock(req, res, projectId))) {
    return;
  }

  const payload = parseStructuringDrainPayload(req, res);
  if (!payload) {
    return;
  }

  const result = publishStructuringDrainingStart({
    projectId,
    streamId: payload.streamId,
    sessionId: auth.sessionId,
    userId: auth.userId,
    username: getActorUsername(req),
    operationType: payload.operationType ?? null,
    operationContext: payload.operationContext ?? null,
  });
  if (!result.ok) {
    return sendApiError(req, res, {
      status: 404,
      code: API_ERROR_CODES.structuring.lockMissing,
      error: 'Structuring event stream is not available',
      details: { brokerCode: result.code },
    });
  }

  closeAnnotationEventConnectionsForProject(projectId, auth.sessionId);

  return res.status(202).json({ success: true, event: result.value });
}

export async function notifyStructuringDrainingStop(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.projectIdRequired,
      error: 'Project ID is required',
    });
  }

  const auth = requireAuthenticatedContext(req, res, 'structuring');
  if (!auth) {
    return;
  }

  if (!(await requireOwnedStructuringLock(req, res, projectId))) {
    return;
  }

  const payload = parseStructuringDrainPayload(req, res);
  if (!payload) {
    return;
  }

  const result = publishStructuringDrainingStop({
    projectId,
    streamId: payload.streamId,
    sessionId: auth.sessionId,
    userId: auth.userId,
    username: getActorUsername(req),
    operationType: payload.operationType ?? null,
    operationContext: payload.operationContext ?? null,
  });
  if (!result.ok) {
    return sendApiError(req, res, {
      status: result.code === 'stream_not_found' ? 404 : 409,
      code: API_ERROR_CODES.structuring.stopFailed,
      error: 'Structuring draining signal is not available',
      details: { brokerCode: result.code },
    });
  }

  return res.status(202).json({ success: true, event: result.value });
}

export async function startStructuring(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.projectIdRequired,
      error: 'Project ID is required',
    });
  }

  const auth = requireAuthenticatedContext(req, res, 'structuring');
  if (!auth) {
    return;
  }

  const operationType = parseOptionalString(
    req,
    res,
    req.body?.operationType,
    API_ERROR_CODES.structuring.invalidOperationType,
    'operationType',
  );
  if (operationType === null) {
    return;
  }

  const operationContext = req.body?.operationContext;
  if (operationContext !== undefined && (typeof operationContext !== 'object' || operationContext === null || Array.isArray(operationContext))) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.invalidOperationContext,
      error: 'operationContext must be an object',
    });
  }

  try {
    const result = await startStructuringLock({
      projectId,
      sessionId: auth.sessionId,
      userId: auth.userId,
      isSysAdmin: auth.isSysAdmin,
      operationType,
      operationContext,
    });

    res.json({
      success: true,
      state: result.state,
      projectId: result.projectId,
      ownerSessionId: result.ownerSessionId,
      fencingToken: result.fencingToken,
      heartbeatExpiresAt: result.heartbeatExpiresAt,
      remainingPresenceCount: result.remainingPresenceCount,
    });
    publishProjectCatalogChanged(projectId, 'updated');
  } catch (error) {
    if (isKnownApiError(error)) {
      return sendApiError(req, res, {
        status: error.status,
        code: error.code,
        error: error.message,
        details: error.details,
      });
    }

    return sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.structuring.startFailed,
      error: 'Failed to start structuring lock',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function heartbeatStructuring(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.projectIdRequired,
      error: 'Project ID is required',
    });
  }

  const auth = requireAuthenticatedContext(req, res, 'structuring');
  if (!auth) {
    return;
  }

  const fencingToken = parseFencingToken(req, res);
  if (fencingToken === null) {
    return;
  }

  try {
    const result = await heartbeatStructuringLock({
      projectId,
      sessionId: auth.sessionId,
      userId: auth.userId,
      fencingToken,
    });

    res.json({
      success: true,
      state: result.state,
      projectId: result.projectId,
      fencingToken: result.fencingToken,
      heartbeatExpiresAt: result.heartbeatExpiresAt,
      remainingPresenceCount: result.remainingPresenceCount,
    });
  } catch (error) {
    if (isKnownApiError(error)) {
      return sendApiError(req, res, {
        status: error.status,
        code: error.code,
        error: error.message,
        details: error.details,
      });
    }

    return sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.structuring.heartbeatFailed,
      error: 'Failed to heartbeat structuring lock',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function stopStructuring(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.structuring.projectIdRequired,
      error: 'Project ID is required',
    });
  }

  const auth = requireAuthenticatedContext(req, res, 'structuring');
  if (!auth) {
    return;
  }

  const fencingToken = parseFencingToken(req, res);
  if (fencingToken === null) {
    return;
  }

  try {
    const result = await stopStructuringLock({
      projectId,
      sessionId: auth.sessionId,
      userId: auth.userId,
      fencingToken,
    });

    res.json({ success: true, ...result });
    publishProjectCatalogChanged(projectId, 'updated');
  } catch (error) {
    if (isKnownApiError(error)) {
      return sendApiError(req, res, {
        status: error.status,
        code: error.code,
        error: error.message,
        details: error.details,
      });
    }

    return sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.structuring.stopFailed,
      error: 'Failed to stop structuring lock',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function startPresence(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.presence.projectIdRequired,
      error: 'Project ID is required',
    });
  }

  const auth = requireAuthenticatedContext(req, res, 'presence');
  if (!auth) {
    return;
  }

  const payload = parsePresencePayload(req, res);
  if (!payload) {
    return;
  }

  try {
    const result = await startProjectPresence({
      projectId,
      sessionId: auth.sessionId,
      userId: auth.userId,
      isSysAdmin: auth.isSysAdmin,
      ...payload,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (isKnownApiError(error)) {
      return sendApiError(req, res, {
        status: error.status,
        code: error.code,
        error: error.message,
        details: error.details,
      });
    }

    return sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.presence.startFailed,
      error: 'Failed to start project presence',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function heartbeatPresence(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.presence.projectIdRequired,
      error: 'Project ID is required',
    });
  }

  const auth = requireAuthenticatedContext(req, res, 'presence');
  if (!auth) {
    return;
  }

  const payload = parsePresencePayload(req, res);
  if (!payload) {
    return;
  }

  try {
    const result = await heartbeatProjectPresence({
      projectId,
      sessionId: auth.sessionId,
      userId: auth.userId,
      isSysAdmin: auth.isSysAdmin,
      ...payload,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (isKnownApiError(error)) {
      return sendApiError(req, res, {
        status: error.status,
        code: error.code,
        error: error.message,
        details: error.details,
      });
    }

    return sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.presence.heartbeatFailed,
      error: 'Failed to heartbeat project presence',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function stopPresence(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return sendApiError(req, res, {
      status: 400,
      code: API_ERROR_CODES.presence.projectIdRequired,
      error: 'Project ID is required',
    });
  }

  const auth = requireAuthenticatedContext(req, res, 'presence');
  if (!auth) {
    return;
  }

  const payload = parsePresencePayload(req, res);
  if (!payload) {
    return;
  }

  try {
    const result = await stopProjectPresence({
      projectId,
      sessionId: auth.sessionId,
      userId: auth.userId,
      isSysAdmin: auth.isSysAdmin,
      ...payload,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (isKnownApiError(error)) {
      return sendApiError(req, res, {
        status: error.status,
        code: error.code,
        error: error.message,
        details: error.details,
      });
    }

    return sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.presence.stopFailed,
      error: 'Failed to stop project presence',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}