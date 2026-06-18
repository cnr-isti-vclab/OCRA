import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../db.js', () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock('../lib/mongo/client.js', () => ({
  getMongoClient: vi.fn(),
}));

import { getPrismaClient } from '../../db.js';
import { getMongoClient } from '../lib/mongo/client.js';
import { createApp } from '../app.js';

const app = createApp();

describe.sequential('readiness endpoint', () => {
  const prismaMock = {
    $queryRawUnsafe: vi.fn(),
  };

  const mongoAdminMock = {
    ping: vi.fn(),
  };

  const mongoClientMock = {
    db: vi.fn(() => ({
      admin: vi.fn(() => mongoAdminMock),
    })),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
    vi.mocked(getMongoClient).mockResolvedValue(mongoClientMock as never);
    prismaMock.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    mongoAdminMock.ping.mockResolvedValue({ ok: 1 });
    process.env.ISSUER = 'https://keycloak.example.test/realms/ocra';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        issuer: process.env.ISSUER,
        token_endpoint: `${process.env.ISSUER}/protocol/openid-connect/token`,
        userinfo_endpoint: `${process.env.ISSUER}/protocol/openid-connect/userinfo`,
      }),
    }));
  });

  it('returns 200 when PostgreSQL, MongoDB, and OIDC are all ready', async () => {
    const response = await request(app)
      .get('/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      ready: true,
      service: 'backend',
      checks: {
        postgres: { ready: true },
        mongo: { ready: true },
        oidc: {
          ready: true,
          issuer: process.env.ISSUER,
        },
      },
    });
  });

  it('returns 503 when one dependency is not ready', async () => {
    mongoAdminMock.ping.mockRejectedValueOnce(new Error('mongo down'));

    const response = await request(app)
      .get('/ready')
      .expect(503);

    expect(response.body.ready).toBe(false);
    expect(response.body.checks.postgres.ready).toBe(true);
    expect(response.body.checks.mongo).toMatchObject({
      ready: false,
      error: 'mongo down',
    });
    expect(response.body.checks.oidc.ready).toBe(true);
  });

  it('is also exposed under /api/ready', async () => {
    const response = await request(app)
      .get('/api/ready')
      .expect(200);

    expect(response.body.ready).toBe(true);
  });
});
