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

// Audit events are stored in MongoDB and returned by the backend API.
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

export interface Vocabulary {
  id: string;
  name: string;
  description: string;
  public: boolean;
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
 * RTI Types
 */
type RTIFormat = 'ptm' | 'lptm' | 'hsh' | 'yrbf';  // 'rsc' 
type RTILayout = 'image' | 'deepzoom' | 'deepzoom1px' | 'google' | 'zoomify' | 'iiif' | 'iip' | 'tarzoom' | 'itarzoom';

/**
 * Digital Asset
 * Represents any type of digital content in the asset pool
 * Currently supports 3D models, extensible to RTI, images, videos, etc.
 */
export interface DigitalAsset {
  id: string;
  type: '3d-model' | 'rti' | 'image' | 'video' | 'other';
  projectId: string;
  label: string;
  title?: string;
  description?: string;
  fileName: string;
  entryPointUrl: string;
  entryPoint: string;
  mimeType: string;
  entrySize?: number;          // Size in bytes
  uploadedAt?: Date | string;
  uploadedBy?: string;        // User ID

  // Type-specific metadata (extensible)
  metadata?: {
    // For 3D models
    triangles?: number;
    vertices?: number;
    format?: string;          // GLB, PLY, OBJ, etc. | Pixel format for RTI planes (e.g. "jpg", "png")

    // For RTI assets (relightable images)
    // Summary metadata extracted from info.json in the RTI asset directory.
    rtiType?: RTIFormat;      // PTM, L-PTM, HSH, Y-RBF, etc.
    rtiLayout?: RTILayout;    // Deep zoom / tiling layout ("image", "deepzoom", etc.)
    zipName?: string;         // zip file name

    // For images and RTI preview rendering
    width?: number;           // Pixel width
    height?: number;          // Pixel height
    resolution?: number;      // DPI (optional, for print-oriented content)

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

  // Future: RTI-specific properties
  // lightDirection?: [number, number, number];
  // renderMode?: 'diffuse' | 'specular' | 'normals';
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
    showGround?: boolean;
    groundColor?: string;
    ambientLight?: number;
    directionalLight?: {
      intensity?: number;
      position?: [number, number, number];
    };
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