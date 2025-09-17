// Shared type definitions for API contracts

export interface User {
  id: string; // Internal DB user ID
  sub: string;
  name: string | null;
  email: string | null;
  username: string | null;
  given_name: string | null;
  family_name: string | null;
  middle_name: string | null;
  sys_admin: boolean;
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


export type RoleEnum = 'admin' | 'manager' | 'editor' | 'viewer';

export interface ProjectRole {
  id: string;
  userId: string;
  projectId: string;
  role: RoleEnum;
  assignedAt: Date;
  user?: User;
  project?: Project;
}

// API Response types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface SessionResponse {
  sessionId: string;
}

export interface UserProfileResponse {
  user: User;
}

export interface ErrorResponse {
  error: string;
  message?: string;
}

// Request types
export interface CreateSessionRequest {
  userProfile: OAuthUserProfile;
  tokens: OAuthTokens;
}

export interface UpdateUserAdminRequest {
  sys_admin: boolean;
}

// Express Request extensions
export interface AuthenticatedRequest {
  user?: User;
  sessionId?: string;
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