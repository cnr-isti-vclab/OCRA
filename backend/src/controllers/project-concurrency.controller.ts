import type { Request, Response } from 'express';
import { ProjectConcurrencyMode } from '@prisma/client';
import { sendApiError } from '../lib/api-error.js';
import { API_ERROR_CODES } from '../lib/api-error-codes.js';
import {
  heartbeatProjectPresence,
  heartbeatStructuringLock,
  isKnownApiError,
  startProjectPresence,
  startStructuringLock,
  stopProjectPresence,
  stopStructuringLock,
} from '../services/project-concurrency.service.js';

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