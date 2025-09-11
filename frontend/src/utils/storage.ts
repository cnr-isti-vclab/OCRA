/**
 * Browser Storage Utilities
 * 
 * Functions for managing browser storage including localStorage, sessionStorage, 
 * cookies, IndexedDB, and Cache API
 */

/**
 * Clear all OAuth-related storage items
 */
export function clearOAuthStorage(): void {
  console.log('🗑️ Clearing all browser storage...');
  
  // Clear specific OAuth-related localStorage items
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
}

/**
 * Clear all cookies for current domain and OAuth provider domain
 */
export function clearAllCookies(oauthIssuer: string): void {
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
      
      // Also try clearing for OAuth provider domain if different
      const oauthDomain = new URL(oauthIssuer).hostname;
      if (oauthDomain !== window.location.hostname) {
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=" + oauthDomain;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=." + oauthDomain;
      }
    }
  };
  
  clearCookies();
}

/**
 * Clear IndexedDB databases
 */
export function clearIndexedDB(): void {
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
}

/**
 * Clear Cache API
 */
export function clearCacheAPI(): void {
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        caches.delete(name);
        console.log('🗑️ Cleared cache:', name);
      });
    }).catch(console.error);
  }
}
