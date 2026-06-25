import type { Request } from 'express';

/**
 * Build the public base URL for asset links.
 * - Supports reverse proxies via X-Forwarded-* headers
 * - Supports explicit override via PUBLIC_BASE_URL
 */
export function getPublicBaseUrl(req?: Request): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  if (req) {
    const forwardedHost = req.get('X-Forwarded-Host');
    const forwardedProto = req.get('X-Forwarded-Proto') || 'http';
    const forwardedPort = req.get('X-Forwarded-Port');

    if (forwardedHost) {
      const hasPort = forwardedHost.includes(':');
      const host = hasPort
        ? forwardedHost
        : (forwardedPort ? `${forwardedHost}:${forwardedPort}` : forwardedHost);
      return `${forwardedProto}://${host}`;
    }

    const protocol = req.secure ? 'https' : 'http';
    const host = req.get('Host') || 'localhost:3002';
    return `${protocol}://${host}`;
  }

  return 'http://localhost:3002';
}
