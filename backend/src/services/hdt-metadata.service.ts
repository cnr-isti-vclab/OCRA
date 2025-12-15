/**
 * HDT Metadata Service
 * 
 * This service manages Heritage Digital Twin documents stored in MongoDB.
 * Each HDT document contains:
 * - Ontology-based metadata (Dublin Core, CIDOC-CRM)
 * - Digital assets pool (3D models, RTI, images, etc.)
 * - Scene configurations (multiple scenes per project)
 * 
 * Uses MongoDB for:
 * - Flexible schema evolution (no migrations needed)
 * - Rich nested metadata structures
 * - Fast metadata queries and updates
 * - Separation from strict PostgreSQL schema
 */

import { connect } from './audit.service.js';
import { ObjectId } from 'mongodb';
import type {
  HDTDocument,
  DigitalAsset,
  HDTScene,
  SceneAssetReference,
  DublinCoreMetadata,
  CidocCrmMetadata,
  SceneDescription,
  ModelDefinition
} from '../types/index.js';
import fs from 'fs/promises';
import path from 'path';

// ==========================================
// MONGODB COLLECTION ACCESS
// ==========================================

const COLLECTION_NAME = 'hdt_collection';

/**
 * Get MongoDB collection for HDT documents
 */
async function getCollection() {
  const { db } = await connect();
  if (!db) {
    throw new Error('MongoDB not connected');
  }
  return db.collection<HDTDocument>(COLLECTION_NAME);
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
  const collection = await getCollection();
  const doc = await collection.findOne({ projectId });
  return doc;
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
  initialData?: {
    dublinCore?: Partial<DublinCoreMetadata>;
    cidocCrm?: Partial<CidocCrmMetadata>;
  }
): Promise<HDTDocument> {
  const collection = await getCollection();

  // Check if document already exists
  const existing = await collection.findOne({ projectId });
  if (existing) {
    throw new Error(`HDT document already exists for project: ${projectId}`);
  }

  const now = new Date();

  console.log('HDT SERVICE: createHDTDocument initialData:', JSON.stringify(initialData, null, 2));

  const newDocument: Omit<HDTDocument, '_id'> = {
    projectId,
    metadata: {
      dublinCore: initialData?.dublinCore || {},
      cidocCrm: initialData?.cidocCrm || {}
    },
    digitalAssets: [],
    scenes: [{
      id: 'default',
      name: 'Default Scene',
      description: 'Default scene created automatically',
      isDefault: true,
      assets: [],
      environment: {
        backgroundColor: '#404040',
        showGround: true,
        ambientLight: 0.5
      },
      createdAt: now,
      createdBy: userId
    }],
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    updatedBy: userId
  };

  const result = await collection.insertOne(newDocument as any);

  return {
    _id: result.insertedId.toString(),
    ...newDocument
  };
}

/**
 * Update HDT metadata (Dublin Core or CIDOC-CRM)
 * 
 * @param projectId - Project ID
 * @param metadataUpdate - Metadata fields to update
 * @param userId - User ID making the update
 * @returns Updated document
 */
export async function updateHDTMetadata(
  projectId: string,
  metadataUpdate: {
    dublinCore?: Partial<DublinCoreMetadata>;
    cidocCrm?: Partial<CidocCrmMetadata>;
  },
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  console.log('HDT SERVICE: updateHDTMetadata metadataUpdate:', JSON.stringify(metadataUpdate, null, 2));

  const updateDoc: any = {
    $set: {
      updatedAt: new Date(),
      updatedBy: userId
    }
  };

  if (metadataUpdate.dublinCore) {
    updateDoc.$set['metadata.dublinCore'] = metadataUpdate.dublinCore;
  }
  if (metadataUpdate.cidocCrm) {
    updateDoc.$set['metadata.cidocCrm'] = metadataUpdate.cidocCrm;
  }

  console.log('HDT SERVICE: updateDoc to MongoDB:', JSON.stringify(updateDoc, null, 2));

  const result = await collection.findOneAndUpdate(
    { projectId },
    updateDoc,
    { returnDocument: 'after' }
  );

  console.log('HDT SERVICE: MongoDB result:', result ? 'Document updated' : 'No document found');

  return result as unknown as HDTDocument | null;
}

/**
 * Delete HDT document for a project
 * 
 * @param projectId - Project ID
 * @returns True if deleted, false if not found
 */
export async function deleteHDTDocument(projectId: string): Promise<boolean> {
  const collection = await getCollection();
  const result = await collection.deleteOne({ projectId });
  return result.deletedCount > 0;
}

// ==========================================
// DIGITAL ASSETS MANAGEMENT
// ==========================================

/**
 * Add a digital asset to the pool
 * 
 * @param projectId - Project ID
 * @param asset - Asset to add (without id, will be auto-generated)
 * @param userId - User ID adding the asset
 * @returns Updated document
 */
export async function addDigitalAsset(
  projectId: string,
  asset: Omit<DigitalAsset, 'id' | 'uploadedAt' | 'uploadedBy'>,
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const newAsset: DigitalAsset = {
    ...asset,
    id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    uploadedAt: new Date(),
    uploadedBy: userId
  };

  // First check if HDT document exists, if not create it
  const existing = await collection.findOne({ projectId });

  if (!existing) {
    // Create initial HDT document with the asset and a default scene
    const now = new Date();

    // Create default scene with the first asset
    const defaultScene: HDTScene = {
      id: `scene_${Date.now()}`,
      name: 'Default Scene',
      description: 'Default scene created automatically',
      isDefault: true,
      assets: [
        {
          assetId: newAsset.id,
          visible: true,
          // Don't set position - let ThreePresenter auto-center
        }
      ],
      environment: {
        showGround: true,
        backgroundColor: '#404040'
      }
    };

    const newDoc: Partial<HDTDocument> = {
      projectId,
      metadata: {
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

    const insertResult = await collection.insertOne(newDoc as any);
    const created = await collection.findOne({ _id: insertResult.insertedId });
    console.log(`✅ Created new HDT document for project ${projectId} with first asset and default scene`);
    console.log(`   - Asset ID: ${newAsset.id}`);
    console.log(`   - Scene: ${defaultScene.name}, Assets in scene: ${defaultScene.assets.length}`);
    console.log(`   - Scene asset refs:`, JSON.stringify(defaultScene.assets, null, 2));
    return created as unknown as HDTDocument | null;
  }

  // Document exists, add asset to it
  const updateOps: any = {
    $push: { digitalAssets: newAsset },
    $set: {
      updatedAt: new Date(),
      updatedBy: userId
    }
  };

  // If there are no scenes, create a default scene with this asset
  if (!existing.scenes || existing.scenes.length === 0) {
    const defaultScene: HDTScene = {
      id: `scene_${Date.now()}`,
      name: 'Default Scene',
      description: 'Default scene created automatically',
      isDefault: true,
      assets: [
        {
          assetId: newAsset.id,
          visible: true,
          // Don't set position - let ThreePresenter auto-center
        }
      ],
      environment: {
        showGround: true,
        backgroundColor: '#404040'
      }
    };
    updateOps.$push.scenes = defaultScene;
    console.log(`✅ Creating default scene for project ${projectId} with asset ${newAsset.id}`);
    console.log(`   - Scene: ${defaultScene.name}, Assets in scene: ${defaultScene.assets.length}`);
    console.log(`   - Scene asset refs:`, JSON.stringify(defaultScene.assets, null, 2));
  } else {
    // Scene(s) exist - add the asset to the default scene
    const defaultSceneIndex = existing.scenes.findIndex((s: any) => s.isDefault || s.id === 'default');

    // ✅ MIGLIORARE: Assicurare che ci sia sempre una scena default
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
        id: `scene_${Date.now()}`, // ✅ ID unico
        name: 'Default Scene',
        description: 'Default scene created automatically',
        isDefault: true, // ✅ Flag corretto
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
  }

  const result = await collection.findOneAndUpdate(
    { projectId },
    updateOps,
    { returnDocument: 'after' }
  );

  const doc = result as unknown as HDTDocument;
  if (doc && doc.scenes) {
    console.log(`📊 HDT document updated. Total scenes: ${doc.scenes.length}`);
    doc.scenes.forEach((scene: any) => {
      console.log(`   - Scene "${scene.name}": ${scene.assets?.length || 0} assets`);
    });
  }

  return result as unknown as HDTDocument | null;
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
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) return null;

  const assetIndex = doc.digitalAssets.findIndex(a => a.id === assetId);
  if (assetIndex === -1) {
    throw new Error(`Asset not found: ${assetId}`);
  }

  // Update the asset
  const updatedAsset = {
    ...doc.digitalAssets[assetIndex],
    ...updates
  };

  doc.digitalAssets[assetIndex] = updatedAsset;

  const result = await collection.findOneAndUpdate(
    { projectId },
    {
      $set: {
        digitalAssets: doc.digitalAssets,
        updatedAt: new Date(),
        updatedBy: userId
      }
    },
    { returnDocument: 'after' }
  );

  return result as unknown as HDTDocument | null;
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
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) return null;

  // Remove from asset pool
  const updatedAssets = doc.digitalAssets.filter(a => a.id !== assetId);

  // Remove from all scenes
  const updatedScenes = doc.scenes.map(scene => ({
    ...scene,
    assets: scene.assets.filter(ref => ref.assetId !== assetId)
  }));

  const result = await collection.findOneAndUpdate(
    { projectId },
    {
      $set: {
        digitalAssets: updatedAssets,
        scenes: updatedScenes,
        updatedAt: new Date(),
        updatedBy: userId
      }
    },
    { returnDocument: 'after' }
  );

  return result as unknown as HDTDocument | null;
}

// ==========================================
// SCENE MANAGEMENT
// ==========================================

/**
 * Add a new scene
 * 
 * @param projectId - Project ID
 * @param scene - Scene data (without id, will be auto-generated)
 * @param userId - User ID creating the scene
 * @returns Updated document
 */
export async function addScene(
  projectId: string,
  scene: Omit<HDTScene, 'id' | 'createdAt' | 'createdBy'>,
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const newScene: HDTScene = {
    ...scene,
    id: `scene_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

  return result as unknown as HDTDocument | null;
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
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) return null;

  const sceneIndex = doc.scenes.findIndex(s => s.id === sceneId);
  if (sceneIndex === -1) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  // If setting as default, unset other defaults
  if (updates.isDefault === true) {
    doc.scenes.forEach(s => { s.isDefault = false; });
  }

  // Convert models array (from frontend) to assets array (for MongoDB)
  // Frontend sends SceneDescription with "models", but MongoDB stores HDTScene with "assets"
  if ((updates as any).models) {
    const modelsArray = (updates as any).models;
    updates.assets = modelsArray.map((model: any) => ({
      assetId: model.id,  // model.id in SceneDescription is the asset ID
      visible: model.visible,
      position: model.position,
      rotation: model.rotation,
      scale: model.scale
    }));
    // Remove the models property as it shouldn't be stored in MongoDB
    delete (updates as any).models;
    delete (updates as any).rotationUnits; // This is also frontend-only
  }

  // Update the scene
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

  return result as unknown as HDTDocument | null;
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
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) return null;

  // Prevent deleting the last scene
  if (doc.scenes.length <= 1) {
    throw new Error('Cannot delete the last scene');
  }

  const updatedScenes = doc.scenes.filter(s => s.id !== sceneId);

  // If we deleted the default scene, make the first one default
  const hadDefault = doc.scenes.find(s => s.id === sceneId)?.isDefault;
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

  return result as unknown as HDTDocument | null;
}

// ==========================================
// SCENE-ASSET ASSOCIATION
// ==========================================

/**
 * Add an asset to a scene
 * 
 * @param projectId - Project ID
 * @param sceneId - Scene ID
 * @param assetReference - Asset reference with transform
 * @param userId - User ID making the change
 * @returns Updated document
 */
export async function addAssetToScene(
  projectId: string,
  sceneId: string,
  assetReference: SceneAssetReference,
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) return null;

  const sceneIndex = doc.scenes.findIndex(s => s.id === sceneId);
  if (sceneIndex === -1) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  // Verify asset exists
  const assetExists = doc.digitalAssets.some(a => a.id === assetReference.assetId);
  if (!assetExists) {
    throw new Error(`Asset not found: ${assetReference.assetId}`);
  }

  // Check if asset already in scene
  const alreadyInScene = doc.scenes[sceneIndex].assets.some(
    ref => ref.assetId === assetReference.assetId
  );
  if (alreadyInScene) {
    throw new Error(`Asset already in scene: ${assetReference.assetId}`);
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

  return result as unknown as HDTDocument | null;
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
  updates: Partial<Omit<SceneAssetReference, 'assetId'>>,
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) return null;

  const sceneIndex = doc.scenes.findIndex(s => s.id === sceneId);
  if (sceneIndex === -1) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  const assetIndex = doc.scenes[sceneIndex].assets.findIndex(
    ref => ref.assetId === assetId
  );
  if (assetIndex === -1) {
    throw new Error(`Asset not in scene: ${assetId}`);
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

  return result as unknown as HDTDocument | null;
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
  userId?: string
): Promise<HDTDocument | null> {
  const collection = await getCollection();

  const doc = await collection.findOne({ projectId });
  if (!doc) return null;

  const sceneIndex = doc.scenes.findIndex(s => s.id === sceneId);
  if (sceneIndex === -1) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  doc.scenes[sceneIndex].assets = doc.scenes[sceneIndex].assets.filter(
    ref => ref.assetId !== assetId
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

  return result as unknown as HDTDocument | null;
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
 * @returns Generated SceneDescription
 */
export async function generateSceneFile(
  projectId: string,
  sceneId: string
): Promise<SceneDescription | null> {
  const doc = await getHDTDocument(projectId);
  if (!doc) return null;

  const scene = doc.scenes.find(s => s.id === sceneId);
  if (!scene) {
    throw new Error(`Scene not found: ${sceneId}`);
  }

  console.log(`📥 Generating scene file from MongoDB. Environment:`, JSON.stringify(scene.environment, null, 2));

  // Convert scene assets to ModelDefinition format
  const models: ModelDefinition[] = scene.assets
    .map(assetRef => {
      const asset = doc.digitalAssets.find(a => a.id === assetRef.assetId);
      if (!asset) {
        console.warn(`Asset not found for reference: ${assetRef.assetId}`);
        return null;
      }

      // Only include 3D models (skip RTI, images, etc. for now)
      if (asset.type !== 'model3d') {
        return null;
      }

      const filename = (asset as any).fileName ?? asset.title;
      const model: ModelDefinition = {
        id: asset.id,
        file: `${asset.id}/${filename}`,
        title: asset.title,
        position: assetRef.position,
        rotation: assetRef.rotation,
        scale: assetRef.scale,
        visible: assetRef.visible ?? true
      };

      return model;
    })
    .filter((m): m is ModelDefinition => m !== null);

  // Build SceneDescription
  const sceneDescription: SceneDescription = {
    projectId,
    models,
    environment: scene.environment ? {
      showGround: scene.environment.showGround,
      background: scene.environment.background || scene.environment.backgroundColor,
      headLightOffset: scene.environment.headLightOffset
    } : undefined,
    enableControls: true,
    rotationUnits: 'deg'  // Rotation values in MongoDB are stored in degrees
  };

  console.log(`✅ Generated scene description from MongoDB for scene: ${sceneId}`);

  return sceneDescription;
}

/**
 * Generate scene file and write to disk (for debugging/export)
 * 
 * @param projectId - Project ID
 * @param sceneId - Scene ID
 * @returns SceneDescription
 */
export async function exportSceneFile(
  projectId: string,
  sceneId: string
): Promise<SceneDescription | null> {
  const sceneDescription = await generateSceneFile(projectId, sceneId);
  if (!sceneDescription) return null;

  // Write to file system for debugging
  const scenesDir = path.join(process.cwd(), 'project_files', projectId, 'scenes');
  await fs.mkdir(scenesDir, { recursive: true });

  const sceneFilePath = path.join(scenesDir, `${sceneId}.json`);
  await fs.writeFile(sceneFilePath, JSON.stringify(sceneDescription, null, 2), 'utf-8');

  console.log(`📁 Exported scene file: ${sceneFilePath}`);

  return sceneDescription;
}

/**
 * Generate scene files for all scenes in a project
 * 
 * @param projectId - Project ID
 * @returns Array of generated SceneDescriptions
 */
export async function generateAllSceneFiles(projectId: string): Promise<SceneDescription[]> {
  const doc = await getHDTDocument(projectId);
  if (!doc) return [];

  const sceneDescriptions: SceneDescription[] = [];

  for (const scene of doc.scenes) {
    const sceneDesc = await generateSceneFile(projectId, scene.id);
    if (sceneDesc) {
      sceneDescriptions.push(sceneDesc);
    }
  }

  return sceneDescriptions;
}

/**
 * Get list of available scene files for a project
 * Returns scene metadata for the scene selector
 * 
 * @param projectId - Project ID
 * @returns Array of scene info
 */
export async function getAvailableScenes(projectId: string): Promise<Array<{
  id: string;
  name: string;
  fileName: string;
  isDefault?: boolean;
}>> {
  const doc = await getHDTDocument(projectId);
  if (!doc) return [];

  return doc.scenes.map(scene => ({
    id: scene.id,
    name: scene.name,
    fileName: `${scene.id}.json`,
    isDefault: scene.isDefault
  }));
}
