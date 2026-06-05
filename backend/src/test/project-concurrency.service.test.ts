import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectConcurrencyMode } from '@prisma/client';

vi.mock('../../db.js', () => ({
  getPrismaClient: vi.fn(),
}));

import { getPrismaClient } from '../../db.js';
import { startProjectPresence } from '../services/project-concurrency.service.js';

describe('project-concurrency.service transaction retries', () => {
  const txMock = {
    projectPresenceLease: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    structuringLock: {
      findUnique: vi.fn(),
    },
  };

  const prismaMock = {
    project: {
      findUnique: vi.fn(),
    },
    projectRole: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);

    prismaMock.project.findUnique.mockResolvedValue({ id: 'project-1', public: true });
    prismaMock.projectRole.findFirst.mockResolvedValue(null);
    txMock.projectPresenceLease.deleteMany.mockResolvedValue({ count: 0 });
    txMock.projectPresenceLease.upsert.mockResolvedValue({
      mode: ProjectConcurrencyMode.viewing,
      heartbeatExpiresAt: new Date('2026-04-26T12:00:15.000Z'),
    });
    txMock.structuringLock.findUnique.mockResolvedValue(null);
  });

  it('retries transient serializable transaction conflicts when starting project presence', async () => {
    prismaMock.$transaction
      .mockRejectedValueOnce({
        code: 'P2034',
        message: 'Transaction failed due to a write conflict or a deadlock. Please retry your transaction',
      })
      .mockImplementation(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock));

    const result = await startProjectPresence({
      projectId: 'project-1',
      sessionId: 'session-1',
      userId: 'user-1',
      isSysAdmin: false,
      mode: ProjectConcurrencyMode.viewing,
      sceneId: 'scene-1',
      clientInstanceId: 'client-1',
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      projectId: 'project-1',
      mode: ProjectConcurrencyMode.viewing,
    });
  });
});