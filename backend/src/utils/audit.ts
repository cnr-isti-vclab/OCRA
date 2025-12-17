import type { Request } from 'express';
import { getClientIp, getUserAgent } from './request.js';
import { logEvent } from '../services/audit.service.js'; // <-- adjust path if needed

type AuditBestEffortArgs = {
  req: Request;
  userSub: string;
  action: string;                 // e.g. "project.update"
  success: boolean;
  resource?: { type: string; id: string } | null;
  payload?: Record<string, any> | null;
};

/**
 * Write an audit log entry, but NEVER fail the main request if auditing fails.
 * This keeps audit best-effort and avoids breaking API behavior.
 */
export async function auditBestEffort(args: AuditBestEffortArgs): Promise<void> {
  const { req, userSub, action, success, resource, payload } = args;

  try {
    await logEvent({
      userSub,
      action,
      success,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      resource: resource ?? null,
      payload: payload ?? null,
      ts: new Date(),
    });
  } catch (err) {
    // Never throw: auditing must not break the API.
    console.warn(
      `Audit log failed (${action}, success=${success}):`,
      err instanceof Error ? err.message : err
    );
  }
}
