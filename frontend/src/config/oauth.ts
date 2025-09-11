/**
 * OAuth Configuration
 * 
 * Central configuration for OAuth2 PKCE flow with Keycloak
 */

export const OAUTH_CONFIG = {
  issuer: 'http://localhost:8081/realms/demo',
  clientId: 'react-oauth',
  redirectUri: 'http://localhost:3001', // Explicit HTTP for local development
  scope: 'openid profile email'
};

// Backend API base URL
export const API_BASE = 'http://localhost:3002/api';
