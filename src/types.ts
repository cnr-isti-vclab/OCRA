/**
 * SHARED TYPE DEFINITIONS
 * 
 * Common types used across the OAuth and database modules.
 * Centralizing these prevents duplication and ensures consistency.
 */

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type?: 'Bearer' | string;
}

export interface UserProfile {
  sub: string;        // OAuth subject identifier
  email: string;
  name?: string;
}

export interface SessionData {
  sessionId: string;
  accessToken: string;
  refreshToken?: string;
  user: {
    id: string;
    sub: string;
    email: string;
    name?: string;
  };
}
