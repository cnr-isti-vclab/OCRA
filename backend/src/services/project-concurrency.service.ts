import {
  Prisma,
  ProjectConcurrencyMode,
  StructuringLockState,
} from '@prisma/client';
import { getPrismaClient } from '../../db.js';
import { apiError, ApiError } from '../lib/api-error.js';
import { API_ERROR_CODES } from '../lib/api-error-codes.js';

const STRUCTURING_LOCK_TTL_MS = 30_000;
const PROJECT_PRESENCE_TTL_MS = 30_000;
const SERIALIZABLE_TRANSACTION_MAX_RETRIES = 5;
const SERIALIZABLE_TRANSACTION_ERROR_MESSAGE = /write conflict|deadlock|could not serialize|serialization failure/i;

type JsonObject = Record<string, unknown>;

export interface StructuringStartInput {
  projectId: string;
  sessionId: string;
  userId: string;
  isSysAdmin: boolean;
  operationType?: string;
  operationContext?: JsonObject;
}

export interface StructuringHeartbeatInput {
  projectId: string;
  sessionId: string;
  userId: string;
  fencingToken: number;
}

export interface StructuringStopInput extends StructuringHeartbeatInput {}

export interface PresenceInput {
  projectId: string;
  sessionId: string;
  userId: string;
  isSysAdmin: boolean;
  mode: ProjectConcurrencyMode;
  sceneId?: string;
  clientInstanceId?: string;
}

interface ActiveLockSnapshot {
  id: string;
  projectId: string;
  ownerSessionId: string;
  ownerUserId: string;
  state: StructuringLockState;
  fencingToken: number;
  heartbeatExpiresAt: Date;
}

interface DrainingProgressSnapshot {
  remainingPresenceCount: number;
  drainDeadlineAt: Date | null;
}

function isRetryableSerializableTransactionError(error: unknown) {
  if (error instanceof ApiError) {
    return false;
  }

  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'P2034'
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return SERIALIZABLE_TRANSACTION_ERROR_MESSAGE.test(message);
}

async function runSerializableTransactionWithRetry<T>(operation: () => Promise<T>) {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (!isRetryableSerializableTransactionError(error) || attempt >= SERIALIZABLE_TRANSACTION_MAX_RETRIES) {
        throw error;
      }
    }
  }
}

function buildPresenceLeaseKey(input: {
  sessionId: string;
  mode: ProjectConcurrencyMode;
  sceneId?: string;
  clientInstanceId?: string;
}) {
  return [
    input.sessionId,
    input.mode,
    input.sceneId ?? '-',
    input.clientInstanceId ?? '-',
  ].join(':');
}

async function assertProjectAccess(projectId: string, userId: string, isSysAdmin: boolean) {
  const prisma = getPrismaClient();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, public: true },
  });

  if (!project) {
    throw apiError(404, API_ERROR_CODES.presence.projectNotFound, 'Project not found');
  }

  if (isSysAdmin || project.public) {
    return project;
  }

  const membership = await prisma.projectRole.findFirst({
    where: { projectId, userId },
    select: { id: true },
  });

  if (!membership) {
    throw apiError(403, API_ERROR_CODES.presence.accessDenied, 'Access denied');
  }

  return project;
}

async function assertProjectManagerAccess(projectId: string, userId: string, isSysAdmin: boolean) {
  const prisma = getPrismaClient();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    throw apiError(404, API_ERROR_CODES.structuring.projectNotFound, 'Project not found');
  }

  if (isSysAdmin) {
    return project;
  }

  const managerRole = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId,
      role: 'manager',
    },
    select: { id: true },
  });

  if (!managerRole) {
    throw apiError(403, API_ERROR_CODES.structuring.managerRequired, 'Only project managers can start structuring');
  }

  return project;
}

async function deleteExpiredPresenceLeases(tx: Prisma.TransactionClient, projectId: string, now: Date) {
  await tx.projectPresenceLease.deleteMany({
    where: {
      projectId,
      heartbeatExpiresAt: { lte: now },
    },
  });
}

function isLockActive(lock: { releasedAt: Date | null; heartbeatExpiresAt: Date }, now: Date) {
  return !lock.releasedAt && lock.heartbeatExpiresAt > now;
}

async function getStructuringLockSnapshot(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<ActiveLockSnapshot | null> {
  const lock = await tx.structuringLock.findUnique({
    where: { projectId },
    select: {
      id: true,
      projectId: true,
      ownerSessionId: true,
      ownerUserId: true,
      state: true,
      fencingToken: true,
      heartbeatExpiresAt: true,
      releasedAt: true,
    },
  });

  if (!lock) {
    return null;
  }

  if (!isLockActive(lock, new Date())) {
    return null;
  }

  return {
    id: lock.id,
    projectId: lock.projectId,
    ownerSessionId: lock.ownerSessionId,
    ownerUserId: lock.ownerUserId,
    state: lock.state,
    fencingToken: lock.fencingToken,
    heartbeatExpiresAt: lock.heartbeatExpiresAt,
  };
}

async function countRemainingPresenceLeases(
  tx: Prisma.TransactionClient,
  projectId: string,
  ownerSessionId: string,
  now: Date,
) {
  return tx.projectPresenceLease.count({
    where: {
      projectId,
      heartbeatExpiresAt: { gt: now },
      sessionId: { not: ownerSessionId },
    },
  });
}

async function getDrainingProgressSnapshot(
  tx: Prisma.TransactionClient,
  projectId: string,
  ownerSessionId: string,
  now: Date,
): Promise<DrainingProgressSnapshot> {
  const [remainingPresenceCount, latestPresenceLease] = await Promise.all([
    countRemainingPresenceLeases(tx, projectId, ownerSessionId, now),
    tx.projectPresenceLease.findFirst({
      where: {
        projectId,
        heartbeatExpiresAt: { gt: now },
        sessionId: { not: ownerSessionId },
      },
      orderBy: { heartbeatExpiresAt: 'desc' },
      select: { heartbeatExpiresAt: true },
    }),
  ]);

  return {
    remainingPresenceCount,
    drainDeadlineAt: latestPresenceLease?.heartbeatExpiresAt ?? null,
  };
}

async function upsertPresenceLease(
  tx: Prisma.TransactionClient,
  input: PresenceInput,
  now: Date,
) {
  const heartbeatExpiresAt = new Date(now.getTime() + PROJECT_PRESENCE_TTL_MS);
  const leaseKey = buildPresenceLeaseKey(input);

  return tx.projectPresenceLease.upsert({
    where: { leaseKey },
    update: {
      userId: input.userId,
      mode: input.mode,
      sceneId: input.sceneId,
      clientInstanceId: input.clientInstanceId,
      lastHeartbeatAt: now,
      heartbeatExpiresAt,
    },
    create: {
      leaseKey,
      projectId: input.projectId,
      sessionId: input.sessionId,
      userId: input.userId,
      mode: input.mode,
      sceneId: input.sceneId,
      clientInstanceId: input.clientInstanceId,
      lastHeartbeatAt: now,
      heartbeatExpiresAt,
    },
  });
}

async function promoteStructuringLockIfReady(
  tx: Prisma.TransactionClient,
  projectId: string,
  ownerSessionId: string,
  now: Date,
) {
  const { remainingPresenceCount, drainDeadlineAt } = await getDrainingProgressSnapshot(
    tx,
    projectId,
    ownerSessionId,
    now,
  );

  const state = remainingPresenceCount === 0 ? StructuringLockState.exclusive : StructuringLockState.draining;

  const lock = await tx.structuringLock.update({
    where: { projectId },
    data: { state },
    select: {
      state: true,
      heartbeatExpiresAt: true,
      fencingToken: true,
      ownerSessionId: true,
      projectId: true,
    },
  });

  return {
    ...lock,
    remainingPresenceCount,
    drainDeadlineAt,
  };
}

async function assertProjectNotLockedByOtherSession(
  tx: Prisma.TransactionClient,
  projectId: string,
  sessionId: string,
  now: Date,
) {
  const lock = await tx.structuringLock.findUnique({
    where: { projectId },
    select: {
      ownerSessionId: true,
      heartbeatExpiresAt: true,
      releasedAt: true,
    },
  });

  if (lock && isLockActive(lock, now) && lock.ownerSessionId !== sessionId) {
    throw apiError(423, API_ERROR_CODES.presence.projectLocked, 'Project locked by another structuring session');
  }
}

export async function startStructuringLock(input: StructuringStartInput) {
  await assertProjectManagerAccess(input.projectId, input.userId, input.isSysAdmin);
  const prisma = getPrismaClient();

  return runSerializableTransactionWithRetry(() => prisma.$transaction(async (tx) => {
    const now = new Date();
    await deleteExpiredPresenceLeases(tx, input.projectId, now);

    const existingLock = await tx.structuringLock.findUnique({
      where: { projectId: input.projectId },
      select: {
        id: true,
        fencingToken: true,
        ownerSessionId: true,
        ownerUserId: true,
        heartbeatExpiresAt: true,
        releasedAt: true,
      },
    });

    if (existingLock && isLockActive(existingLock, now) && existingLock.ownerSessionId !== input.sessionId) {
      throw apiError(409, API_ERROR_CODES.structuring.lockAlreadyActive, 'Another active structuring lock already exists');
    }

    const heartbeatExpiresAt = new Date(now.getTime() + STRUCTURING_LOCK_TTL_MS);
    const lockData = {
      ownerSessionId: input.sessionId,
      ownerUserId: input.userId,
      state: StructuringLockState.draining,
      operationType: input.operationType,
      operationContext: input.operationContext as Prisma.InputJsonValue | undefined,
      heartbeatExpiresAt,
      acquiredAt: now,
      releasedAt: null,
    };

    if (!existingLock) {
      await tx.structuringLock.create({
        data: {
          projectId: input.projectId,
          fencingToken: 1,
          ...lockData,
        },
      });
    } else {
      await tx.structuringLock.update({
        where: { projectId: input.projectId },
        data: {
          fencingToken: existingLock.fencingToken + (existingLock.ownerSessionId === input.sessionId && isLockActive(existingLock, now) ? 0 : 1),
          ...lockData,
        },
      });
    }

    await upsertPresenceLease(tx, {
      projectId: input.projectId,
      sessionId: input.sessionId,
      userId: input.userId,
      isSysAdmin: input.isSysAdmin,
      mode: ProjectConcurrencyMode.structuring,
    }, now);

    return promoteStructuringLockIfReady(tx, input.projectId, input.sessionId, now);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  }));
}

export async function heartbeatStructuringLock(input: StructuringHeartbeatInput) {
  const prisma = getPrismaClient();

  return runSerializableTransactionWithRetry(() => prisma.$transaction(async (tx) => {
    const now = new Date();
    await deleteExpiredPresenceLeases(tx, input.projectId, now);

    const lock = await tx.structuringLock.findUnique({
      where: { projectId: input.projectId },
      select: {
        ownerSessionId: true,
        ownerUserId: true,
        fencingToken: true,
        heartbeatExpiresAt: true,
        releasedAt: true,
      },
    });

    if (!lock || !isLockActive(lock, now)) {
      throw apiError(410, API_ERROR_CODES.structuring.lockMissing, 'Structuring lock expired or missing');
    }

    if (lock.ownerSessionId !== input.sessionId || lock.ownerUserId !== input.userId) {
      throw apiError(403, API_ERROR_CODES.structuring.ownerRequired, 'Caller is not the structuring lock owner');
    }

    if (lock.fencingToken !== input.fencingToken) {
      throw apiError(409, API_ERROR_CODES.structuring.fencingTokenMismatch, 'Structuring lock fencing token mismatch');
    }

    const heartbeatExpiresAt = new Date(now.getTime() + STRUCTURING_LOCK_TTL_MS);
    await tx.structuringLock.update({
      where: { projectId: input.projectId },
      data: { heartbeatExpiresAt },
    });

    await upsertPresenceLease(tx, {
      projectId: input.projectId,
      sessionId: input.sessionId,
      userId: input.userId,
      isSysAdmin: false,
      mode: ProjectConcurrencyMode.structuring,
    }, now);

    return promoteStructuringLockIfReady(tx, input.projectId, input.sessionId, now);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  }));
}

export async function stopStructuringLock(input: StructuringStopInput) {
  const prisma = getPrismaClient();

  return runSerializableTransactionWithRetry(() => prisma.$transaction(async (tx) => {
    const now = new Date();
    const lock = await tx.structuringLock.findUnique({
      where: { projectId: input.projectId },
      select: {
        ownerSessionId: true,
        ownerUserId: true,
        fencingToken: true,
        heartbeatExpiresAt: true,
        releasedAt: true,
      },
    });

    if (!lock || !isLockActive(lock, now)) {
      throw apiError(410, API_ERROR_CODES.structuring.lockMissing, 'Structuring lock expired or missing');
    }

    if (lock.ownerSessionId !== input.sessionId || lock.ownerUserId !== input.userId) {
      throw apiError(403, API_ERROR_CODES.structuring.ownerRequired, 'Caller is not the structuring lock owner');
    }

    if (lock.fencingToken !== input.fencingToken) {
      throw apiError(409, API_ERROR_CODES.structuring.fencingTokenMismatch, 'Structuring lock fencing token mismatch');
    }

    await tx.structuringLock.update({
      where: { projectId: input.projectId },
      data: {
        releasedAt: now,
        heartbeatExpiresAt: now,
      },
    });

    await tx.projectPresenceLease.deleteMany({
      where: {
        projectId: input.projectId,
        leaseKey: buildPresenceLeaseKey({
          sessionId: input.sessionId,
          mode: ProjectConcurrencyMode.structuring,
        }),
      },
    });

    return {
      projectId: input.projectId,
      released: true,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  }));
}

export async function startProjectPresence(input: PresenceInput) {
  await assertProjectAccess(input.projectId, input.userId, input.isSysAdmin);
  const prisma = getPrismaClient();

  return runSerializableTransactionWithRetry(() => prisma.$transaction(async (tx) => {
    const now = new Date();
    await deleteExpiredPresenceLeases(tx, input.projectId, now);
    await assertProjectNotLockedByOtherSession(tx, input.projectId, input.sessionId, now);

    const lease = await upsertPresenceLease(tx, input, now);

    return {
      projectId: input.projectId,
      mode: lease.mode,
      heartbeatExpiresAt: lease.heartbeatExpiresAt,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  }));
}

export async function heartbeatProjectPresence(input: PresenceInput) {
  return startProjectPresence(input);
}

export async function stopProjectPresence(input: PresenceInput) {
  await assertProjectAccess(input.projectId, input.userId, input.isSysAdmin);
  const prisma = getPrismaClient();

  return runSerializableTransactionWithRetry(() => prisma.$transaction(async (tx) => {
    const now = new Date();
    await deleteExpiredPresenceLeases(tx, input.projectId, now);

    await tx.projectPresenceLease.deleteMany({
      where: {
        projectId: input.projectId,
        leaseKey: buildPresenceLeaseKey({
          sessionId: input.sessionId,
          mode: input.mode,
          sceneId: input.sceneId,
          clientInstanceId: input.clientInstanceId,
        }),
      },
    });

    const lock = await getStructuringLockSnapshot(tx, input.projectId);
    if (lock && lock.ownerSessionId !== input.sessionId) {
      await promoteStructuringLockIfReady(tx, input.projectId, lock.ownerSessionId, now);
    }

    return {
      projectId: input.projectId,
      stopped: true,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  }));
}

export function isKnownApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}