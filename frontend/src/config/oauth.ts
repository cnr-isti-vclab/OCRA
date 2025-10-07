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
      redirectUri: typeof window !== 'undefined' && window.__APP_CONFIG__?.redirectUri 
        ? window.__APP_CONFIG__.redirectUri 
        : 'http://localhost:5173', // Fallback for development
      scope: typeof window !== 'undefined' && window.__APP_CONFIG__?.scope 
        ? window.__APP_CONFIG__.scope 
        : 'openid profile email'
    };
    return config[prop as keyof typeof config];
  }
});

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

  // Fallback for local development
  return 'http://localhost:3002';
}

// Backend API base URL with /api suffix - uses dynamic getApiBase()
export const API_BASE = `${getApiBase()}/api`;
