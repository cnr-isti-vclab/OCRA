/**
 * Health Controller
 * 
 * HTTP request handlers for health check endpoints
 */

import express from 'express';
import { getPrismaClient } from '../../db.js';
type Request = express.Request;
type Response = express.Response;

import { getMongoClient } from '../lib/mongo/client.js';

interface DependencyReadiness {
  ready: boolean;
  latencyMs?: number;
  error?: string;
}

interface OidcReadiness extends DependencyReadiness {
  issuer?: string | null;
  discoveryUrl?: string | null;
}

function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  controller.signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });
  return controller.signal;
}

async function checkPostgresReadiness(): Promise<DependencyReadiness> {
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

async function checkMongoReadiness(): Promise<DependencyReadiness> {
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

async function checkOidcReadiness(): Promise<OidcReadiness> {
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

/**
 * Basic health check
 */
export async function healthCheck(req: Request, res: Response): Promise<void> {
  res.json({ status: 'ok', service: 'backend' });
}

/**
 * Composite readiness check for external traffic.
 */
export async function readinessCheck(req: Request, res: Response): Promise<void> {
  const [postgres, mongo, oidc] = await Promise.all([
    checkPostgresReadiness(),
    checkMongoReadiness(),
    checkOidcReadiness(),
  ]);

  const ready = postgres.ready && mongo.ready && oidc.ready;
  const payload = {
    ready,
    service: 'backend',
    checks: {
      postgres,
      mongo,
      oidc,
    },
  };

  if (!ready) {
    res.status(503).json(payload);
    return;
  }

  res.status(200).json(payload);
}
