import type { Request } from 'express';

/**
 * Best-effort client IP extraction.
 *
 * Notes:
 * - req.ip is the "Express" IP (works well when `app.set('trust proxy', true)` is enabled)
 * - req.socket.remoteAddress is the TCP peer (often a reverse proxy address)
 */
export function getClientIp(req: Request): string | null {
  // Prefer Express-computed IP (honors trust proxy configuration).
  if (typeof req.ip === 'string' && req.ip.length > 0) return req.ip;

  // Fallback to socket peer address.
  const sockIp = req.socket?.remoteAddress;
  if (typeof sockIp === 'string' && sockIp.length > 0) return sockIp;

  return null;
}

/**
 * Safe user-agent extraction.
 */
export function getUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string' && ua.trim().length > 0) return ua;
  return null;
}
