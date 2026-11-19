import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../db.js', () => ({
  getPrismaClient: vi.fn(),
}));

vi.mock('../lib/mongo/client.js', () => ({
  getMongoClient: vi.fn(),
  getAuditDb: vi.fn(),
  getContentDb: vi.fn(),
}));

import { getPrismaClient } from '../../db.js';
import { getAuditDb, getContentDb, getMongoClient } from '../lib/mongo/client.js';
import { createApp } from '../app.js';

const app = createApp();
const TOKEN = 'test-metrics-token';

describe.sequential('metrics endpoint', () => {
  const prismaMock = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    user: { count: vi.fn().mockResolvedValue(5) },
    session: { count: vi.fn().mockResolvedValue(2) },
    projectPresenceLease: { findMany: vi.fn().mockResolvedValue([{ userId: 'u1' }]) },
    project: { findMany: vi.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]) },
    projectRole: { groupBy: vi.fn().mockResolvedValue([{ role: 'manager', _count: { _all: 3 } }]) },
  };

  const collectionMock = {
    createIndex: vi.fn().mockResolvedValue('ok'),
    countDocuments: vi.fn().mockResolvedValue(1),
    aggregate: vi.fn((pipeline: Array<Record<string, unknown>>) => ({
      toArray: async () => ('$sort' in (pipeline[2] ?? {})
        ? [{ userSub: 's1', createdAt: new Date() }]
        : [{ _id: 'auth.login', count: 7 }]),
    })),
  };
  const dbMock = { collection: vi.fn(() => collectionMock) };

  beforeEach(() => {
    process.env.METRICS_TOKEN = TOKEN;
    process.env.ISSUER = 'https://oidc.example.test/realms/ocra';
    vi.mocked(getPrismaClient).mockReturnValue(prismaMock as never);
    vi.mocked(getMongoClient).mockResolvedValue({ db: () => ({ admin: () => ({ ping: async () => ({ ok: 1 }) }) }) } as never);
    vi.mocked(getAuditDb).mockResolvedValue(dbMock as never);
    vi.mocked(getContentDb).mockResolvedValue(dbMock as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ issuer: process.env.ISSUER, token_endpoint: 't', userinfo_endpoint: 'u' }),
    }));
  });

  afterEach(() => {
    delete process.env.METRICS_TOKEN;
    vi.unstubAllGlobals();
  });

  it('is disabled when METRICS_TOKEN is unset', async () => {
    delete process.env.METRICS_TOKEN;
    await request(app).get('/metrics').expect(404);
  });

  it('rejects a missing or wrong token', async () => {
    await request(app).get('/metrics').expect(401);
    await request(app).get('/metrics').set('Authorization', 'Bearer wrong').expect(401);
  });

  it('serves service-level and usage metrics with a valid token', async () => {
    await request(app).get('/health').expect(200);
    await request(app).get('/scanner/probe-123').expect(404);

    const response = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    const body = response.text;
    expect(body).toContain('ocra_ready 1');
    expect(body).toContain('ocra_dependency_up{dependency="mongo"} 1');
    expect(body).toMatch(/ocra_http_requests_total\{method="GET",route="\/health\/",status="200"\} \d+/);
    expect(body).toContain('route="unmatched",status="404"');
    expect(body).not.toContain('probe-123');
    expect(body).toContain('ocra_users 5');
    expect(body).toContain('ocra_active_users{window="1d"} 1');
    expect(body).toContain('ocra_online_users 1');
    expect(body).toContain('ocra_projects{echoes_linked="true"} 1');
    expect(body).toContain('ocra_projects{echoes_linked="false"} 2');
    expect(body).toContain('ocra_project_members{role="manager"} 3');
    expect(body).toContain('ocra_annotations{kind="geometry"} 1');
    expect(body).toContain('ocra_audit_events{action="auth.login"} 7');
    expect(body).toContain('process_cpu_user_seconds_total');
  });
});
