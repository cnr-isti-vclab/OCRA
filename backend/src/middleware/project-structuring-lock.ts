import type { NextFunction, Request, Response } from 'express';
import { StructuringLockState } from '@prisma/client';
import { getPrismaClient } from '../../db.js';
import { sendApiError } from '../lib/api-error.js';
import { API_ERROR_CODES } from '../lib/api-error-codes.js';

function isActiveLock(lock: { heartbeatExpiresAt: Date; releasedAt: Date | null } | null) {
  return !!lock && !lock.releasedAt && lock.heartbeatExpiresAt > new Date();
}

function getRequestSessionId(req: Request) {
  if (req.sessionId) {
    return req.sessionId;
  }

  if (process.env.NODE_ENV === 'test') {
    const testSessionIdHeader = req.headers['x-test-session-id'];
    if (typeof testSessionIdHeader === 'string' && testSessionIdHeader.trim()) {
      return testSessionIdHeader;
    }
  }

  const cookieSessionId = req.cookies?.session_id;
  if (typeof cookieSessionId === 'string' && cookieSessionId.trim()) {
    return cookieSessionId;
  }

  const authorizationHeader = req.headers.authorization;
  if (typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')) {
    const bearerSessionId = authorizationHeader.substring(7).trim();
    if (bearerSessionId) {
      return bearerSessionId;
    }
  }

  const querySessionId = req.query.session_id;
  if (typeof querySessionId === 'string' && querySessionId.trim()) {
    return querySessionId;
  }

  return null;
}

async function requireOwnedStructuringLockInternal(
  req: Request,
  res: Response,
  projectId: string,
  requireExclusive: boolean,
): Promise<boolean> {
  try {
    const prisma = getPrismaClient();
    const lock = await prisma.structuringLock.findUnique({
      where: { projectId },
      select: {
        ownerSessionId: true,
        heartbeatExpiresAt: true,
        releasedAt: true,
        state: true,
      },
    });

    if (!isActiveLock(lock)) {
      sendApiError(req, res, {
        status: 409,
        code: API_ERROR_CODES.structuring.lockMissing,
        error: 'An active structuring lock is required for this operation',
      });
      return false;
    }

    const requestSessionId = getRequestSessionId(req);
    const ownershipMismatch = !lock || lock.ownerSessionId !== requestSessionId;
    const stateMismatch = requireExclusive && !!lock && lock.state !== StructuringLockState.exclusive;

    if (ownershipMismatch || stateMismatch) {
      sendApiError(req, res, {
        status: 423,
        code: API_ERROR_CODES.structuring.ownerRequired,
        error: requireExclusive
          ? 'This operation requires the caller to own the exclusive structuring lock'
          : 'This operation requires the caller to own the active structuring lock',
      });
      return false;
    }

    return true;
  } catch (error) {
    sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.common.internalError,
      error: 'Failed to verify structuring lock ownership',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

export async function requireOwnedStructuringLock(
  req: Request,
  res: Response,
  projectId: string,
): Promise<boolean> {
  return requireOwnedStructuringLockInternal(req, res, projectId, false);
}

export async function requireOwnedExclusiveStructuringLock(
  req: Request,
  res: Response,
  projectId: string,
): Promise<boolean> {
  return requireOwnedStructuringLockInternal(req, res, projectId, true);
}

export async function enforceStructuringLock(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { projectId } = req.params;
  if (!projectId) {
    next();
    return;
  }

  const requestSessionId = getRequestSessionId(req);

  try {
    const prisma = getPrismaClient();
    const lock = await prisma.structuringLock.findUnique({
      where: { projectId },
      select: {
        ownerSessionId: true,
        heartbeatExpiresAt: true,
        releasedAt: true,
      },
    });

    if (!isActiveLock(lock) || (lock && lock.ownerSessionId === requestSessionId)) {
      next();
      return;
    }

    sendApiError(req, res, {
      status: 423,
      code: API_ERROR_CODES.structuring.projectLocked,
      error: 'Project is locked by another structuring session',
    });
  } catch (error) {
    sendApiError(req, res, {
      status: 500,
      code: API_ERROR_CODES.common.internalError,
      error: 'Failed to enforce structuring lock',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}