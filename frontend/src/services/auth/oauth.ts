/**
 * OAuth2 PKCE Flow Service
 * 
 * Handles OAuth2 authorization code flow with PKCE (Proof Key for Code Exchange)
 * as defined in RFC 7636
 */

import { OAUTH_CONFIG, API_BASE } from '../../config/oauth';
import { generateRandomString, sha256 } from '../../utils/pkce';
import type { OAuthTokens, OAuthUserProfile } from 'shared/types';

const SILENT_AUTH_MESSAGE_TYPE = 'ocra:silent-auth-callback';
const SILENT_AUTH_STATE_PREFIX = 'ocra-silent-auth:';
const SILENT_AUTH_TIMEOUT_MS = 10000;

export interface AuthFlowResult {
  tokens: OAuthTokens;
  userProfile: OAuthUserProfile;
}

export interface StartAuthFlowOptions {
  prompt?: string;
  redirectUri?: string;
  state?: string;
}

interface PreparedAuthRequest {
  authorizationUrl: string;
  codeVerifier: string;
  redirectUri: string;
  state: string;
}

interface SilentAuthCallbackMessage {
  type: typeof SILENT_AUTH_MESSAGE_TYPE;
  search: string;
}

function isSilentAuthCallbackMessage(data: unknown): data is SilentAuthCallbackMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const candidate = data as Record<string, unknown>;
  return candidate.type === SILENT_AUTH_MESSAGE_TYPE && typeof candidate.search === 'string';
}

function isSilentAuthState(state: string | null): boolean {
  return typeof state === 'string' && state.startsWith(SILENT_AUTH_STATE_PREFIX);
}

async function prepareAuthRequest(options: StartAuthFlowOptions = {}): Promise<PreparedAuthRequest> {
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await sha256(codeVerifier);
  const redirectUri = options.redirectUri ?? OAUTH_CONFIG.redirectUri;
  const state = options.state ?? generateRandomString(32);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_CONFIG.scope,
    code_challenge: codeChallenge,
    code_challenge_method: crypto.subtle ? 'S256' : 'plain',
    state
  });

  if (options.prompt) {
    params.set('prompt', options.prompt);
  }

  return {
    authorizationUrl: `${OAUTH_CONFIG.issuer}/protocol/openid-connect/auth?${params.toString()}`,
    codeVerifier,
    redirectUri,
    state
  };
}

/**
 * Start OAuth2 authorization flow - redirect to authorization server
 */
export async function startAuthFlow(options: StartAuthFlowOptions = {}): Promise<void> {
  const { authorizationUrl, codeVerifier } = await prepareAuthRequest(options);

  // Store verifier for later use (temporary, cleared after token exchange)
  sessionStorage.setItem('oauth_code_verifier', codeVerifier);

  window.location.href = authorizationUrl;
}

/**
 * Detect whether the current window is an iframe callback carrying a silent-auth response.
 */
export function relaySilentAuthCallbackToParent(): boolean {
  if (typeof window === 'undefined' || window.parent === window) {
    return false;
  }

  const search = window.location.search;
  const params = new URLSearchParams(search);
  if (!isSilentAuthState(params.get('state'))) {
    return false;
  }

  window.parent.postMessage(
    {
      type: SILENT_AUTH_MESSAGE_TYPE,
      search
    } satisfies SilentAuthCallbackMessage,
    window.location.origin
  );

  return true;
}

/**
 * Check whether the user already has an active IdP session without altering the main page flow.
 */
export async function probeExistingProviderSession(): Promise<AuthFlowResult | null> {
  if (typeof window === 'undefined' || window.parent !== window) {
    return null;
  }

  const request = await prepareAuthRequest({
    prompt: 'none',
    state: `${SILENT_AUTH_STATE_PREFIX}${generateRandomString(24)}`
  });

  return await new Promise<AuthFlowResult | null>((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timeoutId);
      iframe.remove();
    };

    const finish = (result: AuthFlowResult | null) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    const onMessage = async (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || !isSilentAuthCallbackMessage(event.data)) {
        return;
      }

      const params = new URLSearchParams(event.data.search);
      if (params.get('state') !== request.state) {
        return;
      }

      const error = params.get('error');
      if (error) {
        finish(null);
        return;
      }

      const code = params.get('code');
      if (!code) {
        finish(null);
        return;
      }

      try {
        const authResult = await exchangeCodeForTokens(code, request.codeVerifier, request.redirectUri);
        finish(authResult);
      } catch {
        finish(null);
      }
    };

    const timeoutId = window.setTimeout(() => finish(null), SILENT_AUTH_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
    iframe.src = request.authorizationUrl;
    document.body.appendChild(iframe);
  });
}

/**
 * Exchange OAuth authorization code for tokens
 * Uses backend proxy to keep client_secret secure
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string = OAUTH_CONFIG.redirectUri
): Promise<AuthFlowResult> {
  // Use backend proxy instead of directly calling OAuth provider
  // This keeps the CLIENT_SECRET secure on the backend
  // API_BASE is configured from VITE_API_BASE env var or window.__APP_CONFIG__
  const tokenResponse = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      code: code,
      codeVerifier: codeVerifier,
      redirectUri
    })
  });
  
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
  }
  
  const data = await tokenResponse.json();
  
  // Backend returns { tokens, userProfile }
  // Return in the format expected by the caller
  return {
    tokens: data.tokens,
    userProfile: data.userProfile
  };
}

/**
 * Get user profile from access token
 */
export async function getUserProfile(accessToken: string) {
  const userInfoResponse = await fetch(`${OAUTH_CONFIG.issuer}/protocol/openid-connect/userinfo`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!userInfoResponse.ok) {
    throw new Error(`Failed to get user info: ${userInfoResponse.status}`);
  }
  
  return await userInfoResponse.json();
}
