// Thin re-export to keep a stable import path across the app
export {
  OAUTH_CONFIG,
  startAuthFlow,
  forgetProviderSession,
  probeExistingProviderSession,
  relaySilentAuthCallbackToParent,
  completeAuthCodeFlow,
  createSessionFromAuthResult,
  getCurrentUser,
  getUserAuditLog,
  getFullAuditLog,
  logout,
} from './services/auth';
