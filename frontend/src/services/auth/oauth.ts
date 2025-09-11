/**
 * OAuth2 PKCE Flow Service
 * 
 * Handles OAuth2 authorization code flow with PKCE (Proof Key for Code Exchange)
 * as defined in RFC 7636
 */

import { OAUTH_CONFIG } from '../../config/oauth';
import { generateRandomString, sha256 } from '../../utils/pkce';

/**
 * Start OAuth2 authorization flow - redirect to authorization server
 */
export async function startAuthFlow(): Promise<void> {
  // Generate PKCE challenge
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await sha256(codeVerifier);
  
  // Store verifier for later use (temporary, cleared after token exchange)
  sessionStorage.setItem('oauth_code_verifier', codeVerifier);
  
  // Build authorization URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: OAUTH_CONFIG.redirectUri,
    scope: OAUTH_CONFIG.scope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  });
  
  const authUrl = `${OAUTH_CONFIG.issuer}/protocol/openid-connect/auth?${params}`;
  window.location.href = authUrl;
}

/**
 * Exchange OAuth authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string, codeVerifier: string) {
  const tokenResponse = await fetch(`${OAUTH_CONFIG.issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: OAUTH_CONFIG.clientId,
      code: code,
      redirect_uri: OAUTH_CONFIG.redirectUri,
      code_verifier: codeVerifier
    })
  });
  
  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorText}`);
  }
  
  return await tokenResponse.json();
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
