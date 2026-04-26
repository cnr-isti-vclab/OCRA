/**
 * OAuth Configuration
 *
 * Central configuration for OAuth2 PKCE flow with Keycloak
 */

// Extend Window interface for runtime config
declare global {
  interface Window {
    __APP_CONFIG__?: {
      providerUrl?: string;
      realm?: string;
      issuer?: string;
      clientId?: string;
      redirectUri?: string;
      scope?: string;
      apiBase?: string;
    };
  }
}

const CANONICAL_LOCAL_FRONTEND_ORIGIN = 'http://localhost:3001';
const LEGACY_LOCAL_FRONTEND_ORIGIN = 'http://localhost:5173';

function isLocalDevOrigin(origin: string) {
  return origin === CANONICAL_LOCAL_FRONTEND_ORIGIN || origin === LEGACY_LOCAL_FRONTEND_ORIGIN;
}

// OAuth configuration as a getter - evaluated when accessed, not when imported
export const OAUTH_CONFIG = new Proxy({} as any, {
  get(target, prop) {
    const config = {
      issuer: typeof window !== 'undefined' && window.__APP_CONFIG__?.issuer 
        ? window.__APP_CONFIG__.issuer 
        : 'http://localhost:8081/realms/demo',
      clientId: typeof window !== 'undefined' && window.__APP_CONFIG__?.clientId 
        ? window.__APP_CONFIG__.clientId 
        : 'react-oauth',
      redirectUri: getRedirectUri(), // Use dynamic redirect URI logic
      scope: typeof window !== 'undefined' && window.__APP_CONFIG__?.scope 
        ? window.__APP_CONFIG__.scope 
        : 'openid profile email'
    };
    return config[prop as keyof typeof config];
  }
});

// Get redirect URI - checks runtime config first, then dynamic origin, then fallback
export function getRedirectUri(): string {
  // Docker/Production: Use runtime config from window.__APP_CONFIG__
  // BUT ignore if it's one of the local development fallback values
  if (typeof window !== 'undefined' && 
      window.__APP_CONFIG__?.redirectUri && 
      !isLocalDevOrigin(window.__APP_CONFIG__.redirectUri)) {
    return window.__APP_CONFIG__.redirectUri;
  }

  // Production/Docker: Use current origin (works for nginx reverse proxy)
  // This automatically adapts to whatever domain/port the app is served from
  if (typeof window !== 'undefined' && !isLocalDevOrigin(window.location.origin)) {
    return window.location.origin;
  }

  // Fallback for local development with Vite
  return CANONICAL_LOCAL_FRONTEND_ORIGIN;
}

// Get API base URL - checks Vite env var first, then runtime config, then fallback
export function getApiBase(): string {
  // Development: Use Vite environment variable
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }

  // Docker/Production: Use runtime config from window.__APP_CONFIG__
  if (typeof window !== 'undefined' && window.__APP_CONFIG__?.apiBase) {
    return window.__APP_CONFIG__.apiBase;
  }

  // Production with reverse proxy: Use relative URL (same origin)
  // This works when backend is served at /api path on the same domain
  if (typeof window !== 'undefined' && !isLocalDevOrigin(window.location.origin)) {
    return window.location.origin;
  }

  // Fallback for local development
  return 'http://localhost:3002';
}

export function appendStoredSessionId(url: URL): URL {
  if (typeof window === 'undefined') {
    return url;
  }

  const sessionId = window.localStorage.getItem('oauth_session_id');
  if (sessionId && !url.searchParams.has('session_id')) {
    url.searchParams.set('session_id', sessionId);
  }

  return url;
}

// Backend API base URL with /api suffix - uses dynamic getApiBase()
export const API_BASE = `${getApiBase()}/api`;