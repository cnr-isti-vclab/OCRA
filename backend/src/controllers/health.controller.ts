/**
 * Health Controller
 * 
 * HTTP request handlers for health check endpoints
 */

import express from 'express';
type Request = express.Request;
type Response = express.Response;

import { connect } from '../services/audit.service.js';

/**
 * Basic health check
 */
export async function healthCheck(req: Request, res: Response): Promise<void> {
  res.json({ status: 'ok', service: 'backend' });
}

/**
 * Mongo health check
 */
export async function mongoHealth(req: Request, res: Response): Promise<void> {
  try {
    const { client } = await connect();
    if (!client) {
      res.status(503).json({ success: false, mongo: { connected: false } });
      return;
    }
    // Use admin command ping to verify connectivity
    const adminDb = client.db().admin();
    const start = Date.now();
    const ping = await adminDb.ping();
    const durationMs = Date.now() - start;
    res.json({
      success: true,
      mongo: {
        connected: true,
        pingResult: ping,
        lastPingMs: durationMs
      }
    });
  } catch (err) {
    res.status(503).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}