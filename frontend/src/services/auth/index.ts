/**
 * Authentication Services Index
 * 
 * Central export point for all authentication-related services
 */

export { OAUTH_CONFIG } from '../../config/oauth';

// OAuth flow functions
export { startAuthFlow, probeExistingProviderSession, relaySilentAuthCallbackToParent } from './oauth';

// Session management functions
export { 
  completeAuthCodeFlow, 
  createSessionFromAuthResult,
  getCurrentUser, 
  logout, 
  getUserAuditLog,
  getFullAuditLog
} from './session';

// Debug utilities
export { 
  inspectBrowserStorage, 
  checkLastLogout, 
  testAuthState 
} from '../../utils/debug';
