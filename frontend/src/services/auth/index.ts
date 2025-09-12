/**
 * Authentication Services Index
 * 
 * Central export point for all authentication-related services
 */

export { OAUTH_CONFIG } from '../../config/oauth';

// OAuth flow functions
export { startAuthFlow } from './oauth';

// Session management functions
export { 
  completeAuthCodeFlow, 
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
