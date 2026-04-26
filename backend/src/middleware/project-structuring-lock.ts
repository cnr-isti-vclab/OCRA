import type { NextFunction, Request, Response } from 'express';
import { getPrismaClient } from '../../db.js';
import { sendApiError } from '../lib/api-error.js';
import { API_ERROR_CODES } from '../lib/api-error-codes.js';

function isActiveLock(lock: { heartbeatExpiresAt: Date; releasedAt: Date | null } | null) {
  return !!lock && !lock.releasedAt && lock.heartbeatExpiresAt > new Date();
}

export async function enforceStructuringLock(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { projectId } = req.params;
  if (!projectId) {
    next();
    return;
  }

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

    if (!isActiveLock(lock) || (lock && lock.ownerSessionId === req.sessionId)) {
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