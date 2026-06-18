import { getPrismaClient } from '../../db.js';
import { getMongoClient } from './mongo/client.js';

export interface DependencyReadiness {
  ready: boolean;
  latencyMs?: number;
  error?: string;
}

export interface OidcReadiness extends DependencyReadiness {
  issuer?: string | null;
  discoveryUrl?: string | null;
}

export interface BackendReadinessReport {
  ready: boolean;
  service: 'backend';
  checks: {
    postgres: DependencyReadiness;
    mongo: DependencyReadiness;
    oidc: OidcReadiness;
  };
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
  return controller.signal;
}

export async function checkPostgresReadiness(): Promise<DependencyReadiness> {
  const prisma = getPrismaClient();
  const startedAt = Date.now();

  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return { ready: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ready: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function checkMongoReadiness(): Promise<DependencyReadiness> {
  const startedAt = Date.now();

  try {
    const client = await getMongoClient();
    await client.db().admin().ping();
    return { ready: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ready: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function checkOidcReadiness(): Promise<OidcReadiness> {
  const issuer = process.env.ISSUER?.trim() || null;
  if (!issuer) {
    return {
      ready: false,
      issuer: null,
      discoveryUrl: null,
      error: 'ISSUER is not configured',
    };
  }

  const discoveryUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const startedAt = Date.now();

  try {
    const response = await fetch(discoveryUrl, {
      method: 'GET',
      signal: createTimeoutSignal(5000),
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        ready: false,
        issuer,
        discoveryUrl,
        latencyMs: Date.now() - startedAt,
        error: `OIDC discovery returned HTTP ${response.status}`,
      };
    }

    const payload = await response.json() as {
      issuer?: string;
      token_endpoint?: string;
      userinfo_endpoint?: string;
    };

    if (!payload?.issuer || !payload?.token_endpoint || !payload?.userinfo_endpoint) {
      return {
        ready: false,
        issuer,
        discoveryUrl,
        latencyMs: Date.now() - startedAt,
        error: 'OIDC discovery payload is missing required endpoints',
      };
    }

    return {
      ready: true,
      issuer,
      discoveryUrl,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ready: false,
      issuer,
      discoveryUrl,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getBackendReadinessReport(): Promise<BackendReadinessReport> {
  const [postgres, mongo, oidc] = await Promise.all([
    checkPostgresReadiness(),
    checkMongoReadiness(),
    checkOidcReadiness(),
  ]);

  return {
    ready: postgres.ready && mongo.ready && oidc.ready,
    service: 'backend',
    checks: {
      postgres,
      mongo,
      oidc,
    },
  };
}
