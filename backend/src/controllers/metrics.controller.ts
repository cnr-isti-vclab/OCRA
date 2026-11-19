/**
 * Metrics Controller
 *
 * Serves Prometheus metrics to the ECHOES monitoring platform, guarded by a static
 * bearer token shared with the scraper (METRICS_TOKEN).
 */

import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { sendApiError } from '../lib/api-error.js';
import { collectMetrics, metricsRegistry } from '../services/metrics.service.js';

/** Endpoint is disabled (404) unless METRICS_TOKEN is set; otherwise requires `Authorization: Bearer <token>`. */
export function requireMetricsToken(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.METRICS_TOKEN?.trim();
  if (!token) {
    next('router');
    return;
  }

  const expected = Buffer.from(`Bearer ${token}`);
  const given = Buffer.from(req.headers.authorization ?? '');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    sendApiError(req, res, { status: 401, code: 'common.unauthorized', error: 'Invalid metrics token' });
    return;
  }

  next();
}

export async function getMetrics(req: Request, res: Response): Promise<void> {
  const body = await collectMetrics();
  res.set('Content-Type', metricsRegistry.contentType);
  res.send(body);
}
