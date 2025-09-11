/**
 * Session Management Service
 * 
 * Handles backend session operations including creation, validation, and cleanup
 */

import { API_BASE, OAUTH_CONFIG } from '../../config/oauth';
import { exchangeCodeForTokens, getUserProfile } from './oauth';
import { clearOAuthStorage, clearAllCookies, clearIndexedDB, clearCacheAPI } from '../../utils/storage';

/**
 * Complete OAuth authorization code flow and create backend session
 */
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
    const tokens = await exchangeCodeForTokens(code, codeVerifier);
    
    // Get user profile from access token
    const userProfile = await getUserProfile(tokens.access_token);
    
    // Create session in backend
    const sessionResponse = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include', // Include cookies in request
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

/**
 * Get current user from backend session
 */
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
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      credentials: 'include' // Include cookies in request
    });
    
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

/**
 * Logout - clear session from backend and redirect to OAuth provider logout
 */
export async function logout(): Promise<void> {
  console.log('🚀 Logout function called');
  const sessionId = localStorage.getItem('oauth_session_id');
  console.log('📍 Session ID:', sessionId);
  
  if (sessionId) {
    try {
      console.log('🔄 Calling backend logout API...');
      // Delete session from backend (this also logs the logout event)
      const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include' // Include cookies in request
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
  console.log('✅ Backend logout successful, redirecting to OAuth logout...');
  
  // Clear all browser storage
  clearOAuthStorage();
  clearAllCookies(OAUTH_CONFIG.issuer);
  clearIndexedDB();
  clearCacheAPI();
  
  console.log('✅ All browser storage cleared');
  
  // For complete logout, we need to redirect to OAuth provider's logout URL
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
    console.log('🚀 Now redirecting to OAuth provider logout...');
    window.location.href = logoutUrl.toString();
  }, 2000);
}

/**
 * Get user's audit log
 */
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
    
    const result = await response.json();
    
    // The backend returns { success: true, userSub, auditLog }
    // We need to return just the auditLog array
    return result.auditLog || [];
    
  } catch (error) {
    console.error('Error getting audit log:', error);
    return [];
  }
}
