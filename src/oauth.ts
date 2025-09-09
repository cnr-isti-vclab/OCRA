/**
 * Minimal OAuth2 Authorization Code Flow with PKCE for the browser.
 *
 * This module intentionally uses small, readable functions and inline comments
 * so it can be used in a course to explain the moving parts.
 */

export type OAuthConfig = {
  issuer: string; // e.g. https://localhost:8081/realms/demo (for Keycloak)
  realm?: string; // optional, informational
  clientId: string; // public SPA client
  redirectUri: string; // where the provider should redirect back to
  scope?: string; // e.g. "openid profile email"
};

export type OAuthTokens = {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: 'Bearer' | string;
  expires_in: number;
};

type DiscoveryDoc = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string; // Keycloak exposes logout at a well-known path even if not in discovery
};

// Keys used in sessionStorage. Keeping them centralized for clarity.
const SS = {
  verifier: 'oauth_pkce_verifier',
  state: 'oauth_state',
  tokens: 'oauth_tokens',
  discovery: 'oauth_discovery',
} as const;

// Read runtime configuration from window.__APP_CONFIG__ (injected at container start)
// and fall back to Vite env for local dev (VITE_* variables).
export function getConfig(): OAuthConfig {
  const w = window as any;
  const runtime = w.__APP_CONFIG__ || {};
  const issuer = runtime.issuer || runtime.providerUrl && runtime.realm ? `${runtime.providerUrl.replace(/\/$/, '')}/realms/${runtime.realm}` : undefined;
  const envIssuer = import.meta?.env?.VITE_ISSUER as string | undefined;
  const envProvider = import.meta?.env?.VITE_PROVIDER_URL as string | undefined;
  const envRealm = import.meta?.env?.VITE_REALM as string | undefined;
  const issuerFromEnv = envIssuer || (envProvider && envRealm ? `${envProvider.replace(/\/$/, '')}/realms/${envRealm}` : undefined);

  const cfg: OAuthConfig = {
    issuer: issuer || issuerFromEnv || 'http://localhost:8081/realms/demo',
    realm: runtime.realm || envRealm,
    clientId: runtime.clientId || (import.meta?.env?.VITE_CLIENT_ID as string) || 'react-oauth',
    redirectUri: runtime.redirectUri || (import.meta?.env?.VITE_REDIRECT_URI as string) || window.location.origin,
    scope: runtime.scope || (import.meta?.env?.VITE_SCOPE as string) || 'openid profile email',
  };
  return cfg;
}

// OpenID Connect discovery to find endpoints.
async function discoverEndpoints(issuer: string): Promise<DiscoveryDoc> {
  const cached = sessionStorage.getItem(SS.discovery);
  if (cached) return JSON.parse(cached) as DiscoveryDoc;

  const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`Failed discovery: ${res.status}`);
  const json = await res.json();
  const doc: DiscoveryDoc = {
    authorization_endpoint: json.authorization_endpoint,
    token_endpoint: json.token_endpoint,
    userinfo_endpoint: json.userinfo_endpoint,
    end_session_endpoint: json.end_session_endpoint,
  };
  sessionStorage.setItem(SS.discovery, JSON.stringify(doc));
  return doc;
}

// PKCE helpers: generate a random code verifier and its SHA-256 based challenge.
function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr.buffer);
}

async function sha256(input: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  return crypto.subtle.digest('SHA-256', data);
}

async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const digest = await sha256(verifier);
  return base64UrlEncode(digest);
}

// 1) Starts the Authorization Code flow: we build an authorization URL and redirect the browser.
export async function loginWithRedirect(): Promise<never> {
  const cfg = getConfig();
  const discovery = await discoverEndpoints(cfg.issuer);

  const verifier = randomString(64);
  const challenge = await pkceChallengeFromVerifier(verifier);
  const state = randomString(32);
  sessionStorage.setItem(SS.verifier, verifier);
  sessionStorage.setItem(SS.state, state);

  const authUrl = new URL(discovery.authorization_endpoint);
  authUrl.searchParams.set('client_id', cfg.clientId);
  authUrl.searchParams.set('redirect_uri', cfg.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', cfg.scope || 'openid profile email');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Redirecting away from the SPA to the provider login page.
  window.location.href = authUrl.toString();
  // Make TypeScript happy: this function never returns because we navigate.
  throw new Error('redirecting');
}

// 2) After the provider redirects back, we should have ?code=...&state=... in the URL.
export function isReturningFromAuth(loc: Location): boolean {
  const params = new URLSearchParams(loc.search);
  return params.has('code') && params.has('state');
}

// 3) Exchange the code for tokens using the PKCE code_verifier.
export async function completeAuthCodeFlow(): Promise<OAuthTokens> {
  const cfg = getConfig();
  const discovery = await discoverEndpoints(cfg.issuer);
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const expectedState = sessionStorage.getItem(SS.state);
  const verifier = sessionStorage.getItem(SS.verifier);
  if (!code || !state) throw new Error('Missing authorization code or state');
  if (!verifier) throw new Error('Missing PKCE verifier in session');
  if (!expectedState || expectedState !== state) throw new Error('State mismatch');

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', cfg.redirectUri);
  body.set('client_id', cfg.clientId);
  body.set('code_verifier', verifier);

  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  const tokens = (await res.json()) as OAuthTokens;
  sessionStorage.removeItem(SS.state);
  sessionStorage.removeItem(SS.verifier);
  sessionStorage.setItem(SS.tokens, JSON.stringify(tokens));
  return tokens;
}

// 4) Call the userinfo endpoint to get a friendly display name/email.
export async function getUserInfo(accessToken: string): Promise<{ name?: string; email?: string }>
{
  const cfg = getConfig();
  const discovery = await discoverEndpoints(cfg.issuer);
  const res = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  return res.json();
}

// 5) Logout: clear local tokens and also hit the provider logout endpoint for a clean sign-out.
export function logout() {
  const cfg = getConfig();
  const tokensRaw = sessionStorage.getItem(SS.tokens);
  sessionStorage.removeItem(SS.tokens);

  const idToken = tokensRaw ? (JSON.parse(tokensRaw) as OAuthTokens).id_token : undefined;
  // Keycloak logout endpoint (front-channel)
  const logoutUrl = new URL(`${cfg.issuer.replace(/\/$/, '')}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.set('post_logout_redirect_uri', cfg.redirectUri);
  logoutUrl.searchParams.set('client_id', cfg.clientId);
  if (idToken) logoutUrl.searchParams.set('id_token_hint', idToken);
  window.location.href = logoutUrl.toString();
}
