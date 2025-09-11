/**
 * Shared Type Definitions
 * 
 * Types that are shared between frontend and backend for API contracts
 */

// Database model types (matching Prisma schema)
export interface User {
  sub: string;
  name: string | null;
  email: string | null;
  username: string | null;
  given_name: string | null;
  family_name: string | null;
  middle_name: string | null;
  sys_admin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: Date;
  user: User;
}

export interface LoginEvent {
  id: string;
  userId: string;
  success: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  sessionId: string | null;
  timestamp: Date;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface ProjectRole {
  id: string;
  userId: string;
  projectId: string;
  roleId: string;
  assignedAt: Date;
  user?: User;
  project?: Project;
  role?: Role;
}

// API Request/Response types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface SessionResponse {
  sessionId: string;
}

export interface ErrorResponse {
  error: string;
  message?: string;
}

export interface CreateSessionRequest {
  code: string;
  codeVerifier: string;
  userProfile?: Partial<User>;
}

export interface UpdateUserAdminRequest {
  sys_admin: boolean;
}

// OAuth token response
export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

// User profile from OAuth provider
export interface OAuthUserProfile {
  sub: string;
  name?: string;
  email?: string;
  username?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  middle_name?: string;
}