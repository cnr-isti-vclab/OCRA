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

export interface LoginEvent {
  id: string;
  userId: string;
  success: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  sessionId: string | null;
  timestamp: Date;
}

// Audit events are now stored in MongoDB. This type reflects the normalized
// shape returned by `audit.service.enrichAuditDocs` used across API responses.
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

// ============================================================================
// HDT (Heritage Digital Twin) Types
// ============================================================================

/**
 * Dublin Core Metadata
 * Ontology-based metadata following Dublin Core standard
 */
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

/**
 * CIDOC-CRM Metadata
 * Ontology-based metadata following CIDOC-CRM standard for cultural heritage
 */
export interface CidocCrmMetadata {
  objectType?: string;        // E22 Human-Made Object
  timeSpan?: {                // E52 Time-Span
    begin?: string;
    end?: string;
  };
  period?: string;            // E4 Period
  production?: {              // E12 Production
    technique?: string;
    place?: string;
    actor?: string;
  };
  material?: string[];        // E57 Material
  dimension?: {               // E54 Dimension
    type?: string;
    value?: number;
    unit?: string;
  }[];
  currentLocation?: string;   // E53 Place
  condition?: string;         // E3 Condition State
}

/**
 * Digital Asset Creation Request
 * Used when frontend creates a new asset - backend will fill in missing fields after upload
 */
export interface DigitalAssetCreateRequest {
  type: '3d-model' | 'rti' | 'image' | 'video' | 'other';
  label: string;
  title?: string;
  description?: string;
  // The following fields are calculated by backend after file upload:
  entryPointUrl?: string;
  entryPoint?: string;
  mimeType?: string;
  entrySize?: number;
  metadata?: {
    // Type-specific metadata (extensible)
    [key: string]: any;
  };
}

/**
 * Digital Asset
 * Represents any type of digital content in the asset pool
 * Currently supports 3D models, extensible to RTI, images, videos, etc.
 */
export interface DigitalAsset {
  id: string;
  projectId: string;
  type: '3d-model' | 'rti' | 'image' | 'video' | 'other';
  title?: string;
  label: string;
  entryPointUrl?: string;
  entryPoint?: string;
  mimeType?: string;
  entrySize?: number;          // Size in bytes
  description?: string;
  uploadedAt: Date | string;
  uploadedBy: string;        // User ID
  
  // Type-specific metadata (extensible)
  metadata?: {
    // For 3D models
    triangles?: number;
    vertices?: number;
    format?: string;          // GLB, PLY, OBJ, etc.
    
    // For RTI (future)
    rtiType?: string;       // PTM, HSH, etc.
    lightPositions?: number;
    zipName?: string;

    // For images (future)
    width?: number;
    height?: number;
    resolution?: number;      // DPI
    
    // For videos (future)
    duration?: number;        // seconds
    codec?: string;
    
    // Extensible for other types
    [key: string]: any;
  };
}

/**
 * Scene Asset Reference
 * References a digital asset within a specific scene with transform properties
 */
export interface SceneAssetReference {
  assetId: string;            // References DigitalAsset.id
  visible?: boolean;          // Default: true
  position?: [number, number, number];
  rotation?: [number, number, number];  // Euler angles in radians
  scale?: number | [number, number, number];
}

/**
 * HDT Scene
 * Represents a specific view/configuration of digital assets
 */
export interface HDTScene {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;        // True for the default scene
  
  // Assets in this scene
  assets: SceneAssetReference[];
  
  // Environment configuration
  environment?: {
    backgroundColor?: string;
    background?: string;        // Alias for backgroundColor (used by SceneDescription)
    showGround?: boolean;
    groundColor?: string;
    ambientLight?: number;
    directionalLight?: {
      intensity?: number;
      position?: [number, number, number];
    };
    headLightOffset?: [number, number];  // Head light offset in degrees [horizontal, vertical]
  };
  
  // Scene metadata
  createdAt?: Date | string;
  updatedAt?: Date | string;
  createdBy?: string;         // User ID
}

/**
 * HDT Document
 * Complete Heritage Digital Twin document stored in MongoDB
 * Links to a Project in PostgreSQL via projectId
 */
export interface HDTDocument {
  _id?: string;               // MongoDB ObjectId (optional, auto-generated)
  projectId: string;          // Link to PostgreSQL project
  
  // Ontology-based metadata (for future RDF/knowledge base integration)
  metadata: {
    dublinCore: DublinCoreMetadata;
    cidocCrm: CidocCrmMetadata;
  };
  
  // Digital assets pool (3D models, RTI, images, etc.)
  digitalAssets: DigitalAsset[];
  
  // Scene configurations
  scenes: HDTScene[];
  
  // Document timestamps
  createdAt?: Date | string;
  updatedAt?: Date | string;
  createdBy?: string;         // User ID who created
  updatedBy?: string;         // User ID who last updated
}

// ============================================================================
// Scene Description Types (for ThreePresenter)
// ============================================================================

/**
 * Describes a single 3D model in the scene
 */
export interface ModelDefinition {
  id: string;
  file: string;
  title?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  rotationUnits?: 'deg' | 'rad';
  scale?: number | [number, number, number];
  visible?: boolean;
  material?: {
    color?: string;
    metalness?: number;
    roughness?: number;
    flatShading?: boolean;
  };
}

/**
 * Describes environment settings for the scene
 */
export interface EnvironmentSettings {
  showGround?: boolean;
  background?: string;
  headLightOffset?: [number, number];
}

/**
 * Complete scene description - what models exist and their properties
 * Stored as scene.json and loaded by ThreePresenter
 */
export interface SceneDescription {
  projectId?: string;
  models: ModelDefinition[];
  environment?: EnvironmentSettings;
  enableControls?: boolean;
  rotationUnits?: 'deg' | 'rad';
  annotations?: any[]; // Annotations (future)
}