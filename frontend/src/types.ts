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

export interface ProjectManagerSummary {
  id: string;
  name?: string;
  email: string;
  username?: string;
  displayName: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  description?: string;
  public: boolean;
  activeUserCount: number;
  activeStructuringLock?: boolean;
  activeStructuringLockOwnedByCurrentSession?: boolean;
  activeStructuringLockHeartbeatExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  manager?: ProjectManagerSummary | null;
}

export interface CurrentUserSummary {
  id: string;
  email: string;
  name?: string;
  username?: string;
  displayName: string;
  sys_admin: boolean;
  sys_creator?: boolean;
}

export interface EchoesHdtListItem {
  namedGraphUri: string;
  digitalTwinUri: string;
  label: string | null;
  title: string | null;
  identifier: string | null;
  heritageEntityUri: string | null;
  graphDate: string | null;
}

export interface EchoesHdtAsset {
  assetUri: string;
  label: string | null;
  title: string | null;
  description: string | null;
  source: string | null;
  format: string | null;
  linkedHeritageEntityUri: string | null;
  importable: boolean;
  importIssue: string | null;
}

export interface EchoesPhysicalObjectMetadata {
  sourceUri: string;
  sourceType: 'echoes' | 'wikidata' | 'arco' | 'other';
  sourceSelectionLocked?: boolean;
  dublinCore?: {
    title?: string;
    creator?: string;
    subject?: string;
    description?: string;
    date?: string;
    type?: string;
    identifier?: string;
    source?: string;
    language?: string;
    coverage?: string;
    rights?: string;
  };
  sourceRecord?: Record<string, unknown>;
}

export interface EchoesHdtDetail {
  namedGraphUri: string;
  digitalTwinUri: string;
  digitalTwinLabel: string | null;
  heritageEntityUri: string | null;
  physicalObjectMetadata: EchoesPhysicalObjectMetadata;
  assets: EchoesHdtAsset[];
}

export interface EchoesImportedProjectSummary {
  id: string;
  name: string;
  description: string;
  public: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EchoesSyncStatus = 'local' | 'registered' | 'synced' | 'dirty';

export interface EchoesReadinessIssue {
  code:
    | 'missing_identifier'
    | 'missing_title'
    | 'missing_heritage_entity_uri'
    | 'missing_asset_source_url';
  severity: 'required' | 'recommended';
  message: string;
  field: string;
  assetId?: string;
  assetLabel?: string;
}

export interface EchoesProjectReadiness {
  canRegister: boolean;
  canPublish: boolean;
  requiredIssues: EchoesReadinessIssue[];
  recommendedIssues: EchoesReadinessIssue[];
}

export interface EchoesProjectStatus {
  projectId: string;
  projectUri: string;
  origin: 'local' | 'imported';
  syncStatus: EchoesSyncStatus;
  heritageEntityUri: string | null;
  digitalTwinUri: string | null;
  namedGraphUri: string | null;
  digitalTwinLabel: string | null;
  assetCount: number;
  lastRegisteredAt: string | null;
  lastSyncedAt: string | null;
  readiness: EchoesProjectReadiness;
}
