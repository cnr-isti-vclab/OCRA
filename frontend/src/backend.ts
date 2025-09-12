// Thin re-export to keep a stable import path across the app
export {
  OAUTH_CONFIG,
  startAuthFlow,
  completeAuthCodeFlow,
  getCurrentUser,
  getUserAuditLog,
  getFullAuditLog,
  logout,
} from './services/auth';
