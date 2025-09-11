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
    
    console.log('✅ OAuth login very successful');
    
  } catch (error) {
    // Clean up on error
    sessionStorage.removeItem('oauth_code_verifier');
    localStorage.removeItem('oauth_session_id');
    throw error;
  }
}

// Get current user from backend session
export async function getCurrentUser(): Promise<any> {
  console.log('🔍 getCurrentUser called');
  
  const sessionId = localStorage.getItem('oauth_session_id');
  console.log('📄 Session ID from localStorage:', sessionId);
  
  if (!sessionId) {
    console.log('❌ No session ID found');
    return null;
  }
  
  try {
    console.log('🌐 Fetching session from backend...');
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`);
    
    if (!response.ok) {
      console.log(`❌ Backend response not ok: ${response.status}`);
      if (response.status === 404) {
        // Session expired or not found
        console.log('🗑️ Removing invalid session ID from localStorage');
        localStorage.removeItem('oauth_session_id');
        return null;
      }
      throw new Error(`Failed to get user: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Got user from backend:', data.user);
    return data.user;
    
  } catch (error) {
    console.error('❌ Error getting current user:', error);
    localStorage.removeItem('oauth_session_id');
    return null;
  }
}

// Logout - clear session from backend and redirect to Keycloak logout
export async function logout(): Promise<void> {
  console.log('🚀 Logout function called');
  const sessionId = localStorage.getItem('oauth_session_id');
  console.log('📍 Session ID:', sessionId);
  
  if (sessionId) {
    try {
      console.log('🔄 Calling backend logout API...');
      // Delete session from backend (this also logs the logout event)
      const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      console.log('✅ Backend logout response:', response.status, response.ok);
    } catch (error) {
      console.error('❌ Error during backend logout:', error);
      // Continue with local cleanup even if backend call fails
    }
  }
  
  // Clear local storage
  localStorage.removeItem('oauth_session_id');
  sessionStorage.removeItem('oauth_code_verifier');
  
  console.log('🧹 Local storage cleared');
  console.log('✅ Backend logout successful, redirecting to Keycloak logout...');
  
  // Clear all possible browser storage
  console.log('🗑️ Clearing all browser storage...');
  
  // First, clear specific OAuth-related items
  const oauthKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('oauth') || key.includes('keycloak') || key.includes('auth') || key.includes('demo') || key.includes('session'))) {
      oauthKeys.push(key);
    }
  }
  
  console.log('🔍 Found OAuth-related localStorage keys:', oauthKeys);
  oauthKeys.forEach(key => {
    console.log(`🗑️ Removing localStorage key: ${key}`);
    localStorage.removeItem(key);
  });
  
  // Clear localStorage and sessionStorage completely
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear all cookies more thoroughly
  const clearCookies = () => {
    const cookies = document.cookie.split(";");
    
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      
      // Clear for current domain and path
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + window.location.hostname;
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + window.location.hostname;
      
      // Also try clearing for Keycloak domain if different
      const keycloakDomain = new URL(OAUTH_CONFIG.issuer).hostname;
      if (keycloakDomain !== window.location.hostname) {
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + keycloakDomain;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + keycloakDomain;
      }
    }
  };
  
  clearCookies();
  
  // Clear IndexedDB if available
  if ('indexedDB' in window) {
    try {
      indexedDB.databases().then(databases => {
        databases.forEach(db => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
            console.log('🗑️ Cleared IndexedDB:', db.name);
          }
        });
      }).catch(console.error);
    } catch (error) {
      console.log('❌ Could not clear IndexedDB:', error);
    }
  }
  
  // Clear Cache API if available
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        caches.delete(name);
        console.log('🗑️ Cleared cache:', name);
      });
    }).catch(console.error);
  }
  
  console.log('✅ All browser storage cleared');
  
  // For complete logout, we need to redirect to Keycloak's logout URL
  // and then back to our application
  const logoutUrl = new URL(`${OAUTH_CONFIG.issuer.replace(/\/$/, '')}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.set('post_logout_redirect_uri', OAUTH_CONFIG.redirectUri);
  logoutUrl.searchParams.set('client_id', OAUTH_CONFIG.clientId);
  
  console.log('🔗 Logout URL prepared:', logoutUrl.toString());
  console.log('⏳ Waiting 2 seconds for console messages to be visible...');
  console.log('💡 TIP: Keep DevTools open to see all logout messages');
  
  // Store logout completion in sessionStorage for debugging
  sessionStorage.setItem('logout_debug', JSON.stringify({
    timestamp: new Date().toISOString(),
    logoutUrl: logoutUrl.toString(),
    step: 'about_to_redirect'
  }));
  
  // Wait longer for console messages to be visible before redirect
  setTimeout(() => {
    console.log('🚀 Now redirecting to Keycloak logout...');
    window.location.href = logoutUrl.toString();
  }, 2000);
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

// Debug function to inspect browser storage
export function inspectBrowserStorage(): void {
  console.log('🔍 === BROWSER STORAGE INSPECTION ===');
  
  // Check for logout debug info first
  const logoutDebug = sessionStorage.getItem('logout_debug');
  if (logoutDebug) {
    console.log('🚪 Last logout attempt:', JSON.parse(logoutDebug));
  }
  
  // Check localStorage
  console.log('📦 localStorage:');
  const oauthRelated = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      const isOAuthRelated = key.includes('oauth') || key.includes('keycloak') || key.includes('auth') || key.includes('demo') || key.includes('session');
      if (isOAuthRelated) {
        console.log(`  🔑 ${key}:`, value);
        oauthRelated.push(key);
      } else {
        console.log(`  ${key}:`, value);
      }
    }
  }
  if (oauthRelated.length > 0) {
    console.log('⚠️ OAuth-related localStorage keys found:', oauthRelated);
  }
  
  // Check sessionStorage
  console.log('📦 sessionStorage:');
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key) {
      console.log(`  ${key}:`, sessionStorage.getItem(key));
    }
  }
  
  // Check cookies
  console.log('🍪 Cookies:');
  if (document.cookie) {
    document.cookie.split(';').forEach(cookie => {
      console.log(`  ${cookie.trim()}`);
    });
  } else {
    console.log('  No cookies found');
  }
  
  // Check IndexedDB
  if ('indexedDB' in window) {
    indexedDB.databases().then(databases => {
      console.log('🗃️ IndexedDB databases:');
      databases.forEach(db => {
        console.log(`  ${db.name} (version: ${db.version})`);
      });
    }).catch(error => {
      console.log('❌ Could not inspect IndexedDB:', error);
    });
  }
  
  console.log('🔍 === END INSPECTION ===');
}

// Debug function to check last logout attempt
export function checkLastLogout(): void {
  console.log('🚪 === LOGOUT DEBUG INFO ===');
  const logoutDebug = sessionStorage.getItem('logout_debug');
  if (logoutDebug) {
    const debug = JSON.parse(logoutDebug);
    console.log('📅 Last logout timestamp:', debug.timestamp);
    console.log('🔗 Logout URL used:', debug.logoutUrl);
    console.log('📍 Step reached:', debug.step);
    
    // Calculate time since logout
    const logoutTime = new Date(debug.timestamp);
    const now = new Date();
    const timeDiff = Math.round((now.getTime() - logoutTime.getTime()) / 1000);
    console.log(`⏱️ Time since logout: ${timeDiff} seconds ago`);
  } else {
    console.log('❌ No logout debug info found');
  }
  console.log('🚪 === END LOGOUT DEBUG ===');
}

// Make inspection function available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).inspectBrowserStorage = inspectBrowserStorage;
  (window as any).checkLastLogout = checkLastLogout;
  
  // Add a function to test authentication state
  (window as any).testAuthState = async () => {
    console.log('🧪 === AUTHENTICATION STATE TEST ===');
    
    const sessionId = localStorage.getItem('oauth_session_id');
    console.log('📄 Session ID in localStorage:', sessionId);
    
    if (sessionId) {
      try {
        const response = await fetch(`${API_BASE}/sessions/${sessionId}`);
        console.log('🌐 Backend session response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Backend session data:', data);
        } else {
          console.log('❌ Backend session invalid');
        }
      } catch (error) {
        console.log('❌ Backend session error:', error);
      }
    }
    
    // Test if clearing ONLY oauth_session_id affects authentication
    console.log('🧪 Testing if clearing oauth_session_id alone breaks auth...');
    const originalSessionId = localStorage.getItem('oauth_session_id');
    if (originalSessionId) {
      localStorage.removeItem('oauth_session_id');
      console.log('🗑️ Temporarily removed oauth_session_id');
      
      const user = await getCurrentUser();
      console.log('👤 getCurrentUser() result after removing session ID:', user);
      
      // Restore it
      localStorage.setItem('oauth_session_id', originalSessionId);
      console.log('🔄 Restored oauth_session_id');
    }
    
    console.log('🧪 === END AUTHENTICATION TEST ===');
  };
}
