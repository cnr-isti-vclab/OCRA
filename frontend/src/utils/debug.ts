/**
 * Debug Utilities
 * 
 * Functions for debugging authentication and storage state
 */

import { API_BASE } from '../config/oauth';
import { getCurrentUser } from '../services/auth/session';

/**
 * Inspect current browser storage state
 */
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
      const isOAuthRelated = key.includes('oauth') || key.includes('auth') || key.includes('demo') || key.includes('session');
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

/**
 * Check last logout attempt debug info
 */
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

/**
 * Test authentication state
 */
export async function testAuthState(): Promise<void> {
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
}

// Make debug functions available globally for browser console
if (typeof window !== 'undefined') {
  (window as any).inspectBrowserStorage = inspectBrowserStorage;
  (window as any).checkLastLogout = checkLastLogout;
  (window as any).testAuthState = testAuthState;
}
