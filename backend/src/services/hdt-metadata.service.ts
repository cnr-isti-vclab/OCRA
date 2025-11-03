/**
 * HDT Metadata Service
 * 
 * This service manages Heritage Digital Twin metadata stored in MongoDB.
 * Metadata is stored in a flexible schema that can be converted to RDF when needed.
 * 
 * Uses MongoDB for:
 * - Flexible schema evolution (no migrations needed)
 * - Rich nested metadata structures
 * - Fast metadata queries and updates
 * - Separation from strict PostgreSQL schema
 */

import { connect } from './audit.service.js';
import { ObjectId } from 'mongodb';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

/**
 * Dublin Core metadata fields
 */
export interface DublinCoreMetadata {
  title?: string;              // dc:title
  creator?: string[];          // dc:creator (can have multiple)
  subject?: string[];          // dc:subject (keywords/topics)
  description?: string;        // dc:description
  publisher?: string[];        // dc:publisher
  contributor?: string[];      // dc:contributor
  date?: string;               // dc:date (ISO 8601)
  type?: string[];             // dc:type (e.g., "3D Model", "Dataset")
  format?: string[];           // dc:format (e.g., "model/gltf-binary")
  identifier?: string[];       // dc:identifier (DOI, URI, etc.)
  source?: string;             // dc:source (original source)
  language?: string[];         // dc:language (ISO 639)
  relation?: string[];         // dc:relation (related resources)
  coverage?: string;           // dc:coverage (spatial/temporal)
  rights?: string;             // dc:rights (copyright statement)
}

/**
 * CIDOC-CRM specific properties for cultural heritage
 */
export interface CidocCrmMetadata {
  // E73 Information Object properties
  objectType?: string;         // Type of cultural heritage object
  
  // Temporal properties
  temporalCoverage?: {
    timeSpanBegin?: string;    // ISO 8601 date/time
    timeSpanEnd?: string;      // ISO 8601 date/time
    period?: string;           // Named period (e.g., "Renaissance")
    century?: string;          // Century reference
  };
  
  // Spatial properties
  spatialCoverage?: {
    placeName?: string;        // Place name
    coordinates?: {            // Geographic coordinates
      latitude: number;
      longitude: number;
      elevation?: number;
    };
    geonames?: string;         // Geonames URI
  };
  
  // Material and technique
  material?: string[];         // Materials used (from Getty AAT)
  technique?: string[];        // Techniques used (from Getty AAT)
  
  // Condition and conservation
  condition?: string;          // Current condition state
  conservationHistory?: string;
  
  // Cultural context
  culturalContext?: string[];  // Cultural affiliations
  styleOrPeriod?: string[];   // Art historical style/period
}

/**
 * Getty AAT (Art & Architecture Thesaurus) controlled vocabulary terms
 */
export interface GettyAATTerms {
  materials?: Array<{
    term: string;              // Human-readable term
    aatId: string;             // Getty AAT ID (e.g., "300010357")
    uri: string;               // Full URI
  }>;
  
  techniques?: Array<{
    term: string;
    aatId: string;
    uri: string;
  }>;
  
  objectTypes?: Array<{
    term: string;
    aatId: string;
    uri: string;
  }>;
}

/**
 * License and rights information
 */
export interface LicenseMetadata {
  licenseType?: string;        // e.g., "CC-BY-4.0", "CC0-1.0"
  licenseUrl?: string;         // URL to license text
  rightsStatement?: string;    // Rights statement URL (rightsstatements.org)
  attribution?: string;        // Attribution text
  accessRights?: 'public' | 'restricted' | 'private';
  useRestrictions?: string;    // Usage restrictions
}

/**
 * 3D model associated with the HDT
 */
export interface HDTModel {
  fileName: string;           // Stored filename in project folder
  fileUrl?: string;           // Accessible URL (e.g., /api/projects/:id/files/:name)
  fileSize?: number;          // Bytes
  mimeType?: string;          // e.g., model/gltf-binary
  uploadedAt?: Date;          // When it was uploaded/selected
}

/**
 * Complete HDT metadata document stored in MongoDB
 */
export interface HDTMetadata {
  _id?: ObjectId;              // MongoDB ID
  projectId: string;           // Link to PostgreSQL project
  
  // Metadata sections
  dublinCore: DublinCoreMetadata;
  cidocCrm: CidocCrmMetadata;
  gettyAAT: GettyAATTerms;
  license: LicenseMetadata;
  
  // Linked 3D model for visualization
  hdtModel?: HDTModel;
  
  // Additional flexible fields
  customMetadata?: Record<string, any>;  // For future extensions
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;          // User ID who created
  updatedBy?: string;          // User ID who last updated
}

// ==========================================
// MONGODB COLLECTION ACCESS
// ==========================================

const COLLECTION_NAME = 'hdt_metadata';

/**
 * Get MongoDB collection for HDT metadata
 */
async function getCollection() {
  const { db } = await connect();
  if (!db) {
    throw new Error('MongoDB not connected');
  }
  return db.collection<HDTMetadata>(COLLECTION_NAME);
}

// ==========================================
// SERVICE FUNCTIONS
// ==========================================

/**
 * Get HDT metadata for a project
 * 
 * @param projectId - Project ID
 * @returns HDT metadata or null if not found
 */
export async function getHDTMetadata(projectId: string): Promise<HDTMetadata | null> {
  const collection = await getCollection();
  
  const metadata = await collection.findOne({ projectId });
  
  return metadata;
}

/**
 * Create new HDT metadata for a project
 * 
 * @param projectId - Project ID
 * @param metadata - Initial metadata (partial)
 * @param userId - User ID creating the metadata
 * @returns Created metadata document
 */
export async function createHDTMetadata(
  projectId: string,
  metadata: Partial<Omit<HDTMetadata, '_id' | 'projectId' | 'createdAt' | 'updatedAt'>>,
  userId?: string
): Promise<HDTMetadata> {
  const collection = await getCollection();
  
  // Check if metadata already exists
  const existing = await collection.findOne({ projectId });
  if (existing) {
    throw new Error(`HDT metadata already exists for project: ${projectId}`);
  }
  
  const now = new Date();
  
  const newMetadata: Omit<HDTMetadata, '_id'> = {
    projectId,
    dublinCore: metadata.dublinCore || {},
    cidocCrm: metadata.cidocCrm || {},
    gettyAAT: metadata.gettyAAT || {},
    license: metadata.license || {},
    hdtModel: metadata.hdtModel,
    customMetadata: metadata.customMetadata || {},
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };
  
  const result = await collection.insertOne(newMetadata as any);
  
  return {
    _id: result.insertedId,
    ...newMetadata
  };
}

/**
 * Update HDT metadata for a project
 * 
 * @param projectId - Project ID
 * @param metadata - Metadata updates (partial)
 * @param userId - User ID making the update
 * @returns Updated metadata document
 */
export async function updateHDTMetadata(
  projectId: string,
  metadata: Partial<Omit<HDTMetadata, '_id' | 'projectId' | 'createdAt' | 'updatedAt'>>,
  userId?: string
): Promise<HDTMetadata | null> {
  const collection = await getCollection();
  
  const updateDoc: any = {
    $set: {
      updatedAt: new Date(),
      updatedBy: userId
    }
  };
  
  // Add each metadata section if provided
  if (metadata.dublinCore) {
    updateDoc.$set.dublinCore = metadata.dublinCore;
  }
  if (metadata.cidocCrm) {
    updateDoc.$set.cidocCrm = metadata.cidocCrm;
  }
  if (metadata.gettyAAT) {
    updateDoc.$set.gettyAAT = metadata.gettyAAT;
  }
  if (metadata.license) {
    updateDoc.$set.license = metadata.license;
  }
  if (metadata.hdtModel) {
    updateDoc.$set.hdtModel = metadata.hdtModel;
  }
  if (metadata.customMetadata) {
    updateDoc.$set.customMetadata = metadata.customMetadata;
  }
  
  const result = await collection.findOneAndUpdate(
    { projectId },
    updateDoc,
    { returnDocument: 'after' }
  );
  
  // findOneAndUpdate returns the document directly with returnDocument: 'after'
  return result as unknown as HDTMetadata | null;
}

/**
 * Delete HDT metadata for a project
 * 
 * @param projectId - Project ID
 * @returns True if deleted, false if not found
 */
export async function deleteHDTMetadata(projectId: string): Promise<boolean> {
  const collection = await getCollection();
  
  const result = await collection.deleteOne({ projectId });
  
  return result.deletedCount > 0;
}

/**
 * Initialize HDT metadata with defaults from project
 * 
 * This creates a basic HDT metadata document using project information
 * from PostgreSQL as a starting point.
 * 
 * @param projectId - Project ID
 * @param projectName - Project name
 * @param projectDescription - Project description
 * @param isPublic - Whether project is public
 * @param userId - User ID creating the metadata
 * @returns Created metadata document
 */
export async function initializeHDTMetadata(
  projectId: string,
  projectName: string,
  projectDescription?: string,
  isPublic?: boolean,
  userId?: string
): Promise<HDTMetadata> {
  const collection = await getCollection();
  
  // Check if already exists
  const existing = await collection.findOne({ projectId });
  if (existing) {
    return existing;
  }
  
  const now = new Date();
  
  const metadata: Omit<HDTMetadata, '_id'> = {
    projectId,
    dublinCore: {
      title: projectName,
      description: projectDescription,
      date: now.toISOString().split('T')[0], // YYYY-MM-DD
      type: ['3D Model', 'Digital Heritage'],
    },
    cidocCrm: {
      objectType: 'Digital Heritage Twin',
    },
    gettyAAT: {},
    license: {
      accessRights: isPublic ? 'public' : 'restricted',
    },
    hdtModel: undefined,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };
  
  const result = await collection.insertOne(metadata as any);
  
  return {
    _id: result.insertedId,
    ...metadata
  };
}

/**
 * Get all projects with HDT metadata
 * 
 * @returns Array of project IDs that have HDT metadata
 */
export async function getProjectsWithHDTMetadata(): Promise<string[]> {
  const collection = await getCollection();
  
  const cursor = collection.find({}, { projection: { projectId: 1 } });
  const results = await cursor.toArray();
  
  return results.map((doc: any) => doc.projectId as string);
}
