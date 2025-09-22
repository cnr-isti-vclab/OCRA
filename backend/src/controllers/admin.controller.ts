import express from 'express';
type Request = express.Request;
type Response = express.Response;

import { getFullAuditLog } from '../services/auth.service.js';

/**
 * Return recent audit events (paginated)
 */
export async function getRecentAuditEvents(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(100, parseInt((req.query.limit as string) || '50', 10));
  const raw = await getFullAuditLog(limit);
  const events: any[] = Array.isArray(raw) ? raw : [];
  res.json({ success: true, totalEvents: events.length, auditLog: events });
  } catch (err) {
    console.error('getRecentAuditEvents error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export default { getRecentAuditEvents };
