/**
 * OAUTH 2.0 + PKCE CLIENT WITH BACKEND API
 * 
 * This module handles OAuth2 authorization code flow with PKCE (Proof Key for Code Exchange)
 * as defined in RFC 7636. Now uses a backend API for session management instead of browser
 * localStorage simulation.
 * 
 * Flow Overview:
 * 1. Generate code_verifier (random string) and code_challenge (SHA256 hash)
 * 2. Redirect to authorization server with code_challenge  
 * 3. Server redirects back with authorization code
 * 4. Exchange code + code_verifier for access token
 * 5. Store session in backend database via API
 */

// Configuration - should match Keycloak client settings
export const OAUTH_CONFIG = {
  issuer: 'http://localhost:8081/realms/demo',
  clientId: 'react-oauth',
  redirectUri: 'http://localhost:3001', // Explicit HTTP for local development
  scope: 'openid profile email'
};

// Backend API base URL
const API_BASE = 'http://localhost:3002/api';

// PKCE code challenge generation
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => 
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[byte % 64]
  ).join('');
}

async function sha256(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Start OAuth flow - redirect to authorization server
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

// Complete OAuth flow - exchange authorization code for tokens
export async function completeAuthCodeFlow(): Promise<void> {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  
  if (error) {
    console.error('OAuth error:', error, urlParams.get('error_description'));
    throw new Error(`OAuth error: ${error}`);
  }
  
  if (!code) {
    console.log('No authorization code found in URL');
    return;
  }
  
  // Get stored code verifier
  const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
  if (!codeVerifier) {
    throw new Error('No code verifier found - invalid OAuth state');
  }
  
  try {
    // Exchange authorization code for tokens
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
    
    const tokens = await tokenResponse.json();
    
    // Get user profile from access token
    const userInfoResponse = await fetch(`${OAUTH_CONFIG.issuer}/protocol/openid-connect/userinfo`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });
    
    if (!userInfoResponse.ok) {
      throw new Error(`Failed to get user info: ${userInfoResponse.status}`);
    }
    
    const userProfile = await userInfoResponse.json();
    
    // Create session in backend
    const sessionResponse = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userProfile,
        tokens
      })
    });
    
    if (!sessionResponse.ok) {
      const errorData = await sessionResponse.json();
      throw new Error(`Failed to create session: ${errorData.error}`);
    }
    
    const { sessionId } = await sessionResponse.json();
    
    // Store session ID locally (only the ID, not the tokens)
    localStorage.setItem('oauth_session_id', sessionId);
    
    // Clean up temporary storage and URL
    sessionStorage.removeItem('oauth_code_verifier');
    window.history.replaceState({}, document.title, window.location.pathname);
    
    console.log('✅ OAuth login successful');
    
  } catch (error) {
    // Clean up on error
    sessionStorage.removeItem('oauth_code_verifier');
    localStorage.removeItem('oauth_session_id');
    throw error;
  }
}

// Get current user from backend session
export async function getCurrentUser(): Promise<any> {
  const sessionId = localStorage.getItem('oauth_session_id');
  if (!sessionId) {
    return null;
  }
  
  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        // Session expired or not found
        localStorage.removeItem('oauth_session_id');
        return null;
      }
      throw new Error(`Failed to get user: ${response.status}`);
    }
    
    const data = await response.json();
    return data.user;
    
  } catch (error) {
    console.error('Error getting current user:', error);
    localStorage.removeItem('oauth_session_id');
    return null;
  }
}

// Logout - clear session from backend and redirect to Keycloak logout
export async function logout(): Promise<void> {
  const sessionId = localStorage.getItem('oauth_session_id');
  
  if (sessionId) {
    try {
      // Delete session from backend (this also logs the logout event)
      await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.error('Error during backend logout:', error);
      // Continue with local cleanup even if backend call fails
    }
  }
  
  // Clear local storage
  localStorage.removeItem('oauth_session_id');
  sessionStorage.removeItem('oauth_code_verifier');
  
  console.log('✅ Backend logout successful, redirecting to Keycloak logout...');
  
  // Redirect to Keycloak logout endpoint to terminate the Keycloak session
  const logoutUrl = new URL(`${OAUTH_CONFIG.issuer.replace(/\/$/, '')}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.set('post_logout_redirect_uri', OAUTH_CONFIG.redirectUri);
  logoutUrl.searchParams.set('client_id', OAUTH_CONFIG.clientId);
  
  window.location.href = logoutUrl.toString();
}

// Get user's audit log
export async function getUserAuditLog(limit: number = 20): Promise<any[]> {
  const sessionId = localStorage.getItem('oauth_session_id');
  if (!sessionId) {
    return [];
  }
  
  // First get current user to get their sub
  const user = await getCurrentUser();
  if (!user?.sub) {
    return [];
  }
  
  try {
    const response = await fetch(`${API_BASE}/users/${user.sub}/audit?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get audit log: ${response.status}`);
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('Error getting audit log:', error);
    return [];
  }
}
