/**
 * HDT Metadata Service (FIXED VERSION)
 * 
 * This service manages Heritage Digital Twin documents stored in MongoDB.
 * Each HDT document contains:
 * - Ontology-based metadata (Dublin Core, CIDOC-CRM)
 * - Digital assets pool (3D models, RTI, images, etc.)
 * - Scene configurations (multiple scenes per project)
 * 
 * FIXED: All functions now return consistent format - no more json.value.value nonsense!
 */

import { ObjectId } from 'mongodb';
import {
  deleteHdtByProjectId,
  findHdtById,
  findHdtByProjectId,
  getHdtCollection,
  insertHdtDocument,
  listHdtProjectIds,
  updateHdtByProjectId,
} from '../repositories/hdt.repository.js';
import type {
  HDTDocument,
  DigitalAsset,
  HDTScene,
  SceneAssetReference,
  PhysicalObjectMetadata,
  SceneDescription,
  ModelDefinition
} from '../types/index.js';
import fs from 'fs/promises';
import path from 'path';

async function getCollection() {
  return getHdtCollection();
}

// ==========================================
// RESPONSE STANDARDIZATION HELPERS
// ==========================================

/**
 * Standardize response from MongoDB operations
 * Ensures all functions return the same format regardless of operation type
 */
function standardizeResponse(result: any): HDTDocument | null {
  if (!result) {
    return null;
  }

  // If it's a findOneAndUpdate result, extract the document from value
  if (result.value) {
    return result.value as HDTDocument;
  }

  // If it's already a document (insertOne result), return as is
  return result as HDTDocument;
}

/**
 * Create standardized success response for operations that need to return documents
 */
function createSuccessResponse(document: HDTDocument): { value: HDTDocument } {
  return { value: document };
}

// ==========================================
// SERVICE FUNCTIONS
// ==========================================

/**
 * Get HDT document for a project
 * 
 * @param projectId - Project ID
 * @returns HDT document or null if not found
 */
export async function getHDTDocument(projectId: string): Promise<HDTDocument | null> {
  return findHdtByProjectId(projectId);
}

/**
 * Create new HDT document for a project
 * 
 * @param projectId - Project ID
 * @param userId - User ID creating the document
 * @param initialData - Optional initial metadata
 * @returns Created HDT document
 */
export async function createHDTDocument(
  projectId: string,
  userId?: string,
  initialData?: Partial<PhysicalObjectMetadata>
): Promise<HDTDocument> {
  // Check if document already exists
  const existing = await findHdtByProjectId(projectId);
  if (existing) {
    throw new Error(`HDT document already exists for project: ${projectId}`);
  }

  const now = new Date();

  console.log('HDT SERVICE: createHDTDocument initialData:', JSON.stringify(initialData, null, 2));

  const sourceUri =
    typeof initialData?.sourceUri === 'string' && initialData.sourceUri.trim().length > 0
      ? initialData.sourceUri.trim()
      : `urn:ocra:project:${projectId}`;
  const sourceType = initialData?.sourceType ?? 'other';

  const physicalObjectMetadata: PhysicalObjectMetadata = {
    sourceUri,
    sourceType,
    dublinCore: initialData?.dublinCore || {},
    cidocCrm: initialData?.cidocCrm || {},
    ...initialData,
  };

  // Guarantee required fields even if initialData overwrote them with invalid values.
  physicalObjectMetadata.sourceUri = sourceUri;
  physicalObjectMetadata.sourceType = sourceType;

  const newDocument: Omit<HDTDocument, '_id'> = {
    projectId,
    physicalObjectMetadata,
    digitalAssets: [],
    scenes: [],
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };

  const result = await insertHdtDocument(newDocument);

  // ✅ STANDARDIZED: Return consistent format
  return {
    _id: result.insertedId.toString(),
    ...newDocument
  } as HDTDocument;
}

/**
 * Update HDT physical object metadata
 * 
 * @param projectId - Project ID
 * @param metadataUpdate - Metadata fields to update
 * @param userId - User ID making the update
 * @returns Updated document
 */
export async function updateHDTMetadata(
  projectId: string,
  metadataUpdate: Partial<PhysicalObjectMetadata>,
  userId?: string
): Promise<HDTDocument | null> {
  const updateDoc: any = {
    $set: {
      updatedAt: new Date(),
      updatedBy: userId
    }
  };

  for (const [key, value] of Object.entries(metadataUpdate ?? {})) {
    if (value === undefined) continue;
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
    updateDoc.$set[`physicalObjectMetadata.${key}`] = value;
  }

  console.log('HDT SERVICE: updateDoc to MongoDB:', JSON.stringify(updateDoc, null, 2));

  const result = await updateHdtByProjectId(projectId, updateDoc);

  console.log('HDT SERVICE: MongoDB result:', result ? 'Document updated' : 'No document found');

  // ✅ STANDARDIZED: Extract document from MongoDB response
  return standardizeResponse(result);
}

/**
 * Delete HDT document for a project
 * 
 * @param projectId - Project ID
 * @returns True if deleted, false if not found
 */
export async function deleteHDTDocument(projectId: string): Promise<boolean> {
  const result = await deleteHdtByProjectId(projectId);
  return result.deletedCount > 0;
}

// ==========================================
// DIGITAL ASSETS MANAGEMENT
// ==========================================

/**
 * Add a digital asset to the pool
 * 
 * @param projectId - Project ID
 * @param asset - Asset to add
 * @param userId - User ID adding the asset
 * @returns Updated document in standardized format
 */
export async function addDigitalAsset(
  projectId: string,
  asset: Omit<DigitalAsset, 'id' | 'uploadedAt' | 'uploadedBy'>,
  userId: string
): Promise<HDTDocument | null> {
  const assetId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const newAsset: DigitalAsset = {
    id: assetId,
    projectId: projectId,
    type: asset.type,
    label: asset.label,
    title: asset.title,
    description: asset.description,
    entryPointUrl: asset.entryPointUrl,
    entryPoint: asset.entryPoint,
    mimeType: asset.mimeType,
    entrySize: asset.entrySize,
    metadata: asset.metadata,
    uploadedAt: now,
    uploadedBy: userId
  };

  console.log(`🔧 [HDT Service] Adding asset ${assetId} to project ${projectId}`);

  const existing = await findHdtByProjectId(projectId);

  if (!existing) {
    // Create new HDT document with first asset and default scene
    const defaultScene: HDTScene = {
      id: `scene_${Date.now()}`,
      label: 'Default Scene',
      description: 'Default scene created automatically',
      isDefault: true,
      assets: [
        {
          assetId: newAsset.id,
          visible: true,
        }
      ],
      environment: {
        showGround: true,
        backgroundColor: '#404040'
      }
    };

    const newDoc: Omit<HDTDocument, '_id'> = {
      projectId,
      physicalObjectMetadata: {
        sourceUri: `urn:ocra:project:${projectId}`,
        sourceType: 'other',
        dublinCore: {},
        cidocCrm: {}
      },
      digitalAssets: [newAsset],
      scenes: [defaultScene],
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId
    };

    await insertHdtDocument(newDoc);
    const created = await findHdtByProjectId(projectId);
    console.log(`✅ Created new HDT document for project ${projectId} with first asset and default scene`);
    console.log(`   - Asset ID: ${newAsset.id}`);
    console.log(`   - Scene: ${defaultScene.label}, Assets in scene: ${defaultScene.assets.length}`);
    console.log(`   - Scene asset refs:`, JSON.stringify(defaultScene.assets, null, 2));

    // ✅ STANDARDIZED: Return consistent format
    return created ? (created as HDTDocument) : null;
  }

  // Document exists, add asset to it
  const updateOps: any = {
    $push: { digitalAssets: newAsset },
    $set: {
      updatedAt: now,
      updatedBy: userId
    }
  };

  // Add to default scene if exists
  const defaultSceneIndex = existing.scenes?.findIndex((s: any) => s.isDefault) ?? -1;

  if (defaultSceneIndex >= 0) {
    // Add asset reference to the existing default scene
    const assetRef = {
      assetId: newAsset.id,
      visible: true,
    };
    updateOps.$push[`scenes.${defaultSceneIndex}.assets`] = assetRef;
    console.log(`✅ Adding asset ${newAsset.id} to existing default scene`);
  } else {
    // No default scene exists - create one
    const defaultScene: HDTScene = {
      id: `scene_${Date.now()}`,
      label: 'Default Scene',
      description: 'Default scene created automatically',
      isDefault: true,
      assets: [
        {
          assetId: newAsset.id,
          visible: true,
        }
      ],
      environment: {
        showGround: true,
        backgroundColor: '#404040'
      }
    };
    updateOps.$push.scenes = defaultScene;
    console.log(`✅ Creating new default scene for existing project`);
  }

  const result = await updateHdtByProjectId(projectId, updateOps);

  // ✅ STANDARDIZED: Extract updated document from MongoDB response
  const doc = standardizeResponse(result);
  if (doc && doc.scenes) {
    console.log(`📊 HDT document updated. Total scenes: ${doc.scenes.length}`);
    doc.scenes.forEach((scene: any) => {
      console.log(`   - Scene "${scene.label}": ${scene.assets?.length || 0} assets`);
    });
  }

  return doc ?? null;
}

/**
 * Update a digital asset in the pool
 * 
 * @param projectId - Project ID
 * @param assetId - Asset ID to update
 * @param updates - Fields to update
 * @param userId - User ID making the update
 * @returns Updated document
 */
export async function updateDigitalAsset(
  projectId: string,
  assetId: string,
  updates: Partial<Omit<DigitalAsset, 'id' | 'uploadedAt' | 'uploadedBy'>>,
  userId: string
): Promise<HDTDocument | null> {
  const setOps: Record<string, any> = {
    updatedAt: new Date(),
    updatedBy: userId,
  };

  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined) {
      setOps[`digitalAssets.$.${k}`] = v;
    }
  }
console.log("[updateDigitalAsset] projectId", projectId, "assetId", assetId, "updates", updates);

  const collection = await getHdtCollection();
  const result = await collection.findOneAndUpdate(
    { projectId, "digitalAssets.id": assetId },
    { $set: setOps },
    { returnDocument: "after" }
  );
console.log("[updateDigitalAsset] returned doc?", !!result?.value);

  return standardizeResponse(result);
}

/**
 * Remove a digital asset from the pool (and from all scenes)
 * 
 * @param projectId - Project ID
 * @param assetId - Asset ID to remove
 * @param userId - User ID making the change
 * @returns Updated document
 */
export async function removeDigitalAsset(
  projectId: string,
  assetId: string,
  userId: string
): Promise<HDTDocument | null> {
  const doc = await findHdtByProjectId(projectId);
  if (!doc) {
    return null;
  }

  const updatedAssets = doc.digitalAssets.filter((asset: any) => asset.id !== assetId);
  const updatedScenes = doc.scenes.map((scene: HDTScene) => ({
    ...scene,
    assets: scene.assets.filter((ref: SceneAssetReference) => ref.assetId !== assetId)
  }));

  const result = await updateHdtByProjectId(projectId, {
    $set: {
      digitalAssets: updatedAssets,
      scenes: updatedScenes,
      updatedAt: new Date(),
      updatedBy: userId
    }
  });

  // ✅ STANDARDIZED: Extract document from MongoDB response
  return standardizeResponse(result);
}

// ==========================================
// SCENE MANAGEMENT
// ==========================================

/**
 * Add a new scene
 * 
 * @param projectId - Project ID
 * @param scene - Scene to add
 * @param userId - User ID adding the scene
 * @returns Updated document
 */
export async function addScene(
  projectId: string,
  scene: Omit<HDTScene, 'id' | 'createdAt' | 'createdBy'>,
  userId: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const sceneId = `scene_${Date.now()}`;  // ✅ Genera sempre ID nuovo
  const newScene: HDTScene = {
    id: sceneId,  // ✅ Usa ID generato
    ...scene,
    assets: scene.assets || [],
    createdAt: new Date(),
    createdBy: userId
  };

  const result = await collection.findOneAndUpdate(
    { projectId },
    {
      $push: { scenes: newScene },
      $set: {
        updatedAt: new Date(),
        updatedBy: userId
      }
    },
    { returnDocument: 'after' }
  );

  // ✅ STANDARDIZED: Extract document from MongoDB response
  return standardizeResponse(result);
}

/**
 * Update a scene
 * 
 * @param projectId - Project ID
 * @param sceneId - Scene ID to update
 * @param updates - Fields to update
 * @param userId - User ID making the update
 * @returns Updated document
 */
export async function updateScene(
  projectId: string,
  sceneId: string,
  updates: Partial<Omit<HDTScene, 'id' | 'createdAt' | 'createdBy'>>,
  userId: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) {
    return null;
  }

  const sceneIndex = doc.scenes.findIndex((scene: HDTScene) => scene.id === sceneId);
  if (sceneIndex === -1) {
    return null;
  }

  doc.scenes[sceneIndex] = {
    ...doc.scenes[sceneIndex],
    ...updates,
    updatedAt: new Date()
  };

  const result = await collection.findOneAndUpdate(
    { projectId },
    {
      $set: {
        scenes: doc.scenes,
        updatedAt: new Date(),
        updatedBy: userId
      }
    },
    { returnDocument: 'after' }
  );

  // ✅ STANDARDIZED: Extract document from MongoDB response
  return standardizeResponse(result);
}

/**
 * Remove a scene (prevents deleting last scene)
 * 
 * @param projectId - Project ID
 * @param sceneId - Scene ID to remove
 * @param userId - User ID making the change
 * @returns Updated document
 */
export async function removeScene(
  projectId: string,
  sceneId: string,
  userId: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc || doc.scenes.length <= 1) {
    return null;
  }

  const updatedScenes = doc.scenes.filter((scene: HDTScene) => scene.id !== sceneId);

  // If we removed the default scene, make the first remaining scene default
  const hadDefault = doc.scenes.find((scene: HDTScene) => scene.id === sceneId)?.isDefault;
  if (hadDefault && updatedScenes.length > 0) {
    updatedScenes[0].isDefault = true;
  }

  const result = await collection.findOneAndUpdate(
    { projectId },
    {
      $set: {
        scenes: updatedScenes,
        updatedAt: new Date(),
        updatedBy: userId
      }
    },
    { returnDocument: 'after' }
  );

  // ✅ STANDARDIZED: Extract document from MongoDB response
  return standardizeResponse(result);
}

// ==========================================
// SCENE-ASSET ASSOCIATION
// ==========================================

/**
 * Add an asset to a scene
 * 
 * @param projectId - Project ID
 * @param sceneId - Scene ID
 * @param assetReference - Asset reference to add
 * @param userId - User ID making the change
 * @returns Updated document
 */
export async function addAssetToScene(
  projectId: string,
  sceneId: string,
  assetReference: SceneAssetReference,
  userId: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) {
    return null;
  }

  const sceneIndex = doc.scenes.findIndex((scene: HDTScene) => scene.id === sceneId);
  if (sceneIndex === -1) {
    return null;
  }

  // Check if asset already exists in scene
  const existingAssetIndex = doc.scenes[sceneIndex].assets.findIndex(
    (ref: SceneAssetReference) => ref.assetId === assetReference.assetId
  );
  if (existingAssetIndex !== -1) {
    return null; // Asset already in scene
  }

  doc.scenes[sceneIndex].assets.push(assetReference);
  doc.scenes[sceneIndex].updatedAt = new Date();

  const result = await collection.findOneAndUpdate(
    { projectId },
    {
      $set: {
        scenes: doc.scenes,
        updatedAt: new Date(),
        updatedBy: userId
      }
    },
    { returnDocument: 'after' }
  );

  // ✅ STANDARDIZED: Extract document from MongoDB response
  return standardizeResponse(result);
}

/**
 * Update an asset reference in a scene
 * 
 * @param projectId - Project ID
 * @param sceneId - Scene ID
 * @param assetId - Asset ID
 * @param updates - Fields to update
 * @param userId - User ID making the update
 * @returns Updated document
 */
export async function updateAssetInScene(
  projectId: string,
  sceneId: string,
  assetId: string,
  updates: Partial<SceneAssetReference>,
  userId: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) {
    return null;
  }

  const sceneIndex = doc.scenes.findIndex((scene: HDTScene) => scene.id === sceneId);
  if (sceneIndex === -1) {
    return null;
  }

  const assetIndex = doc.scenes[sceneIndex].assets.findIndex((ref: SceneAssetReference) => ref.assetId === assetId);
  if (assetIndex === -1) {
    return null;
  }

  doc.scenes[sceneIndex].assets[assetIndex] = {
    ...doc.scenes[sceneIndex].assets[assetIndex],
    ...updates
  };
  doc.scenes[sceneIndex].updatedAt = new Date();

  const result = await collection.findOneAndUpdate(
    { projectId },
    {
      $set: {
        scenes: doc.scenes,
        updatedAt: new Date(),
        updatedBy: userId
      }
    },
    { returnDocument: 'after' }
  );

  // ✅ STANDARDIZED: Extract document from MongoDB response
  return standardizeResponse(result);
}

/**
 * Remove an asset from a scene
 * 
 * @param projectId - Project ID
 * @param sceneId - Scene ID
 * @param assetId - Asset ID to remove
 * @param userId - User ID making the change
 * @returns Updated document
 */
export async function removeAssetFromScene(
  projectId: string,
  sceneId: string,
  assetId: string,
  userId: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) {
    return null;
  }

  const sceneIndex = doc.scenes.findIndex((scene: HDTScene) => scene.id === sceneId);
  if (sceneIndex === -1) {
    return null;
  }

  doc.scenes[sceneIndex].assets = doc.scenes[sceneIndex].assets.filter(
    (ref: SceneAssetReference) => ref.assetId !== assetId
  );
  doc.scenes[sceneIndex].updatedAt = new Date();

  const result = await collection.findOneAndUpdate(
    { projectId },
    {
      $set: {
        scenes: doc.scenes,
        updatedAt: new Date(),
        updatedBy: userId
      }
    },
    { returnDocument: 'after' }
  );

  // ✅ STANDARDIZED: Extract document from MongoDB response
  return standardizeResponse(result);
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Get all projects with HDT documents
 * 
 * @returns Array of project IDs that have HDT documents
 */
export async function getProjectsWithHDT(): Promise<string[]> {
  const collection = await getCollection();
  const cursor = collection.find({}, { projection: { projectId: 1 } });
  const results = await cursor.toArray();
  return results.map((doc: any) => doc.projectId as string);
}

// ==========================================
// SCENE FILE GENERATION
// ==========================================

/**
 * Generate SceneDescription JSON file from HDTScene
 * Converts HDTScene data into the format expected by ThreePresenter
 * 
 * @param projectId - Project ID
 * @param sceneId - Scene ID  
 * @returns SceneDescription object
 */
export async function generateSceneFile(projectId: string, sceneId: string): Promise<SceneDescription> {
  console.log(`📥 Generating scene file from MongoDB. Scene ID: ${sceneId}`);

  const collection = await getCollection();
  const doc = await collection.findOne({ projectId });

  if (!doc) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const scene = doc.scenes.find((s: any) => s.id === sceneId);
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  const modelDefs: ModelDefinition[] = [];

  if (scene.assets && scene.assets.length > 0) {
    for (const assetRef of scene.assets) {
      if (!assetRef.visible) {
        continue;
      }

      const asset = doc.digitalAssets.find((a: any) => a.id === assetRef.assetId);
      if (!asset) {
        console.warn(`⚠️  Asset ${assetRef.assetId} not found in digitalAssets`);
        continue;
      }

      if (asset.type !== '3d-model') {
        console.log(`⏭️  Skipping non-3D asset ${asset.id} (type: ${asset.type})`);
        continue;
      }

      if (!asset.entryPointUrl) {
        console.warn(`⚠️  Asset ${asset.id} has no entryPointUrl`);
        continue;
      }

      const modelDef: ModelDefinition = {
        id: asset.id,
        file: asset.entryPointUrl,
        position: assetRef.position || [0, 0, 0],
        rotation: assetRef.rotation || [0, 0, 0],
        scale: assetRef.scale || [1, 1, 1],
        visible: assetRef.visible ?? true
      };

      modelDefs.push(modelDef);
      console.log(`📦 Added model ${asset.id}: ${asset.entryPoint || 'Unknown'}`);
    }
  }

  console.log(`📥 Generating scene file from MongoDB. Environment:`, JSON.stringify(scene.environment, null, 2));

  const sceneDesc: SceneDescription = {
    projectId: projectId,
    models: modelDefs,
    environment: {
      showGround: scene.environment?.showGround ?? true,
      background: scene.environment?.backgroundColor || '#404040',
      headLightOffset: scene.environment?.headLightOffset || [0, 0] as [number, number]
    },
    enableControls: true,
    rotationUnits: 'rad' as const
  };

  console.log(`✅ Generated scene description from MongoDB for scene: ${sceneId}`);
  return sceneDesc;
}

/**
 * Generate scene files for all scenes in a project
 * 
 * @param projectId - Project ID
 * @returns Array of scene descriptions with their IDs
 */
export async function generateAllSceneFiles(projectId: string): Promise<Array<{ sceneId: string, scene: SceneDescription }>> {
  console.log(`📥 Generating all scene files for project: ${projectId}`);

  const collection = await getCollection();
  const doc = await collection.findOne({ projectId });

  if (!doc) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!doc.scenes || doc.scenes.length === 0) {
    console.log(`⚠️ No scenes found for project: ${projectId}`);
    return [];
  }

  const results = [];

  for (const scene of doc.scenes) {
    try {
      const sceneDesc = await generateSceneFile(projectId, scene.id);
      results.push({
        sceneId: scene.id,
        scene: sceneDesc
      });
      console.log(`✅ Generated scene file for: ${scene.label} (${scene.id})`);
    } catch (error: any) {
      console.error(`❌ Failed to generate scene file for ${scene.id}:`, error.message);
      // Continue with other scenes instead of failing completely
    }
  }

  console.log(`📤 Generated ${results.length} scene files for project: ${projectId}`);
  return results;
}

/**
 * Get available scenes for a project
 * Returns list of scenes with basic info
 * 
 * @param projectId - Project ID
 * @returns Array of scene info
 */
export async function getAvailableScenes(projectId: string): Promise<Array<{
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
  assetCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}>> {
  console.log(`📋 Getting available scenes for project: ${projectId}`);

  const collection = await getCollection();
  const doc = await collection.findOne({ projectId });

  if (!doc || !doc.scenes) {
    console.log(`⚠️ No scenes found for project: ${projectId}`);
    return [];
  }

  const sceneInfos = doc.scenes.map((scene: any) => ({
    id: scene.id,
    label: scene.label,
    description: scene.description,
    isDefault: scene.isDefault || false,
    assetCount: scene.assets ? scene.assets.length : 0,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt
  }));

  console.log(`📤 Found ${sceneInfos.length} scenes for project: ${projectId}`);
  return sceneInfos;
}