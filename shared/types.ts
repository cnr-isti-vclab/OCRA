/**
 * Shared Type Definitions
 *
 * Single source of truth for API contracts between frontend and backend.
 * No runtime dependencies — all exports are TypeScript types/interfaces only.
 */

// ============================================================================
// Auth / Session
// ============================================================================

export interface User {
  id: string;
  sub: string;
  name: string | null;
  email: string | null;
  username: string | null;
  given_name: string | null;
  family_name: string | null;
  middle_name: string | null;
  sys_admin: boolean;
  sys_creator?: boolean;
}

export interface Session {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: Date;
  user: User;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
}

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

// ============================================================================
// Project / Roles
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vocabulary {
  id: string;
  name: string;
  description: string;
  public: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type RoleEnum = 'manager' | 'editor' | 'viewer';

export interface ProjectRole {
  id: string;
  userId: string;
  projectId: string;
  role: RoleEnum;
  assignedAt: Date;
  user?: User;
  project?: Project;
}

// ============================================================================
// Audit
// ============================================================================

export interface LoginEvent {
  id: string;
  userId: string;
  success: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  sessionId: string | null;
  timestamp: Date;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  success: boolean;
  userAgent?: string | null;
  createdAt: Date | string | null;
  errorMessage?: string | null;
  userSub?: string | null;
  user?: {
    sub: string;
    name?: string | null;
    email?: string | null;
    username?: string | null;
    displayName?: string | null;
  } | null;
  resource?: any;
  payload?: any;
}

// ============================================================================
// API Request / Response shapes
// ============================================================================

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

/** Body sent by the frontend when establishing a new backend session. */
export interface CreateSessionRequest {
  userProfile: OAuthUserProfile;
  tokens: OAuthTokens;
}

export interface UpdateUserAdminRequest {
  sys_admin: boolean;
}

// ============================================================================
// HDT (Heritage Digital Twin) — domain types
// ============================================================================

export interface DublinCoreMetadata {
  title?: string;
  creator?: string;
  subject?: string;
  description?: string;
  publisher?: string;
  contributor?: string;
  date?: string;
  type?: string;
  format?: string;
  identifier?: string;
  source?: string;
  language?: string;
  relation?: string;
  coverage?: string;
  rights?: string;
}

export interface CidocCrmMetadata {
  objectType?: string;
  timeSpan?: { begin?: string; end?: string };
  period?: string;
  production?: { technique?: string; place?: string; actor?: string };
  material?: string[];
  dimension?: { type?: string; value?: number; unit?: string }[];
  currentLocation?: string;
  condition?: string;
}

export type PhysicalObjectSourceType = 'echoes' | 'wikidata' | 'arco' | 'other';

export interface PhysicalObjectMetadata {
  sourceUri: string;
  sourceType: PhysicalObjectSourceType;
  sourceSelectionLocked?: boolean;
  dublinCore?: DublinCoreMetadata;
  cidocCrm?: CidocCrmMetadata;
  sourceRecord?: Record<string, any>;
  [key: string]: any;
}

export type EchoesSyncStatus =
  | 'local'
  | 'registered'
  | 'synced'
  | 'dirty';

export interface EchoesAssetRecord {
  assetId: string;
  assetUri: string;
  sourceUrl?: string;
}

export interface EchoesContext {
  origin: 'local' | 'imported';
  syncStatus: EchoesSyncStatus;
  projectUri: string;
  heritageEntityUri?: string;
  digitalTwinUri?: string;
  namedGraphUri?: string;
  digitalTwinLabel?: string;
  importedFromEchoesAt?: Date | string;
  lastRegisteredAt?: Date | string;
  lastSyncedAt?: Date | string;
  lastSyncedProjectUpdatedAt?: Date | string;
  assetRecords?: EchoesAssetRecord[];
}

// RTI sub-types used inside DigitalAsset.metadata
export type RTIFormat = 'ptm' | 'lptm' | 'hsh' | 'yrbf';
export type RTILayout =
  | 'image' | 'deepzoom' | 'deepzoom1px' | 'google'
  | 'zoomify' | 'iiif' | 'iip' | 'tarzoom' | 'itarzoom';

/** Fields sent by the frontend when creating a new digital asset (before upload). */
export interface DigitalAssetCreateRequest {
  type: '3d-model' | 'rti' | 'image' | 'video' | 'other';
  label: string;
  title?: string;
  description?: string;
  publicUri?: string;
  thumbnail?: string;
  assetParadata?: Record<string, any>;
  entryPointUrl?: string;
  entryPoint?: string;
  mimeType?: string;
  entrySize?: number;
  metadata?: Record<string, any>;
}

export interface DigitalAsset {
  id: string;
  projectId: string;
  type: '3d-model' | 'rti' | 'image' | 'video' | 'other';
  label: string;
  title?: string;
  description?: string;
  fileName?: string;
  publicUri?: string;
  thumbnail?: string;
  assetParadata?: Record<string, any>;
  entryPointUrl?: string;
  entryPoint?: string;
  mimeType?: string;
  entrySize?: number;
  uploadedAt: Date | string;
  uploadedBy: string;
  metadata?: {
    triangles?: number;
    vertices?: number;
    format?: string;
    rtiType?: RTIFormat;
    rtiLayout?: RTILayout;
    zipName?: string;
    width?: number;
    height?: number;
    resolution?: number;
    duration?: number;
    codec?: string;
    [key: string]: any;
  };
}

export interface SceneAssetReference {
  assetId: string;
  visible?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
}

export interface HDTScene {
  id: string;
  label: string;
  description?: string;
  type?: '3D' | '2D';
  isDefault?: boolean;
  assets: SceneAssetReference[];
  environment?: {
    backgroundColor?: string;
    background?: string;
    showGround?: boolean;
    groundColor?: string;
    ambientLight?: number;
    directionalLight?: { intensity?: number; position?: [number, number, number] };
    headLightOffset?: [number, number];
  };
  createdAt?: Date | string;
  updatedAt?: Date | string;
  createdBy?: string;
}

/**
 * Complete Heritage Digital Twin document (MongoDB).
 * _id is string here (API/serialized form); the backend uses ObjectId internally.
 * Links to a Project in PostgreSQL via projectId.
 */
export interface HDTDocument {
  _id?: string;
  projectId: string;
  physicalObjectMetadata: PhysicalObjectMetadata;
  echoesContext?: EchoesContext;
  digitalAssets: DigitalAsset[];
  scenes: HDTScene[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
  createdBy?: string;
  updatedBy?: string;
}
