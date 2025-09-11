// Thin re-export to keep a stable import path across the app
export {
  OAUTH_CONFIG,
  startAuthFlow,
  completeAuthCodeFlow,
  getCurrentUser,
  getUserAuditLog,
  logout,
} from './services/auth';
