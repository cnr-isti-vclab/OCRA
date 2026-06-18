/**
 * Health Controller
 *
 * HTTP request handlers for health check endpoints
 */

import express from 'express';
type Request = express.Request;
type Response = express.Response;

import { getBackendReadinessReport } from '../lib/readiness.js';

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
  const payload = await getBackendReadinessReport();

  if (!payload.ready) {
    res.status(503).json(payload);
    return;
  }

  res.status(200).json(payload);
}
