/**
 * HDT Metadata Controller
 *
 * Handles HTTP requests for managing Heritage Digital Twin (HDT) documents.
 * The HDT document lives in MongoDB and contains:
 * - metadata (Dublin Core + CIDOC CRM, etc.)
 * - a pool of digitalAssets (model3d, rti, ...)
 * - scenes and scene-asset associations (scene composition)
 *
 * Storage layout (project_files):
 * - 3D assets are stored under:
 *     project_files/<projectId>/model3d/<assetId>/<filename>
 *   and are served publicly as:
 *     /assets/projects/<projectId>/model3d/<assetId>/<filename>
 *
 * - RTI assets are stored under:
 *     project_files/<projectId>/rti/<assetId>/(info.json + tiles/images/...)
 *   and are served publicly as:
 *     /assets/projects/<projectId>/rti/<assetId>/info.json
 *     (and other RTI files under the same folder)
 *
 * Scenes:
 * - scenes are persisted in MongoDB inside the HDT document.
 * - exporting scene JSON to disk is optional and used only for debugging
 *   (see exportSceneFileHandler).
 */

import { Request, Response } from 'express';
import {
  getHDTDocument,
  createHDTDocument,
  updateHDTMetadata,
  deleteHDTDocument,
  addDigitalAsset,
  updateDigitalAsset,
  removeDigitalAsset,
  addScene,
  updateScene,
  removeScene,
  addAssetToScene,
  updateAssetInScene,
  removeAssetFromScene,
  generateSceneFile,
  generateAllSceneFiles,
  getAvailableScenes
} from '../services/hdt-metadata.service.js';
import { getPrismaClient } from '../../db.js';
import { User } from '../types/index.js';
import { RoleEnum } from '@prisma/client';
import { projectModel3dAssetDir, projectRtiAssetDir } from '../utils/project-static-paths.js';
import fs from 'fs/promises';

/**
 * Get current user from request (populated by auth middleware).
 */
function getCurrentUser(req: Request): User | null {
  return req.user || null;
}

/**
 * Check whether the authenticated user is manager of a given project.
 * - sys_admin users are always allowed
 * - otherwise user must have RoleEnum.manager for the project
 */
async function checkIsManagerOfProject(userSub: string, projectId: string): Promise<boolean> {
  const prisma = getPrismaClient();

  // Get user from database
  const user = await prisma.user.findUnique({ where: { sub: userSub } });
  if (!user) return false;

  // Check if sysadmin
  if (user.sys_admin) return true;

  // Check if manager
  const isManager = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId: user.id,
      role: RoleEnum.manager
    }
  });

  return !!isManager;
}

// ============================================================================
// RTI Helpers
// ============================================================================

/**
 * Resolve the on-disk directory of an RTI asset starting from a public file URL.
 *
 * Supported public URL format:
 *   /assets/projects/<projectId>/rti/<assetId>/info.json
 *
 * Absolute URLs are also supported, for example:
 *   http://host:port/assets/projects/<projectId>/rti/<assetId>/info.json
 *
 * Returns:
 *   project_files/<projectId>/rti/<assetId>
 *
 * Returns null if:
 * - URL is missing or invalid
 * - URL does not match /assets/projects/... pattern
 * - URL does not point to an RTI asset
 *
 * NOTE:
 * In the current storage model we already know <projectId> and <assetId> from
 * the HDT asset record, so in most cases you can compute the directory with:
 *   projectRtiAssetDir(projectId, assetId)
 * This helper is mainly for optional legacy/fallback support.
 */
function resolveRtiAssetDirectory(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;

  let urlPath = fileUrl;

  // If absolute URL, extract only pathname
  try {
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      urlPath = new URL(fileUrl).pathname;
    }
  } catch {
    urlPath = fileUrl;
  }

  const prefix = '/assets/projects/';
  const idx = urlPath.indexOf(prefix);
  if (idx === -1) return null;

  // Expected: /assets/projects/<projectId>/rti/<assetId>/info.json
  const relative = urlPath.slice(idx + prefix.length);
  const segments = relative.split('/').filter(Boolean);

  if (segments.length < 4) return null;

  const [projectId, kind, assetId] = segments;
  if (kind !== 'rti') return null;

  return projectRtiAssetDir(projectId, assetId);
}

// ============================================================================
// HDT DOCUMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/projects/:projectId/hdt
 * Retrieve the HDT document for a project from MongoDB.
 */
export async function getHDTMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const document = await getHDTDocument(projectId);

    if (!document) {
      return res.status(404).json({ error: 'HDT document not found for this project' });
    }

    res.json(document);
  } catch (error: any) {
    console.error('Error fetching HDT document:', error);
    res.status(500).json({
      error: 'Failed to fetch HDT document',
      message: error?.message || String(error)
    });
  }
}

/**
 * POST /api/projects/:projectId/hdt
 * Create/initialize the HDT document for a project (manager only).
 */
export async function createHDTMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Check if user is manager of the project
    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can create HDT document' });
    }

    // Check if document already exists
    const existing = await getHDTDocument(projectId);
    if (existing) {
      return res.status(409).json({
        error: 'HDT document already exists for this project',
        document: existing
      });
    }

    // Get project details to initialize metadata
    const prisma = getPrismaClient();
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true
      }
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Use provided metadata from request body, or fallback to project defaults
    console.log('HDT CREATE: req.body:', JSON.stringify(req.body, null, 2));
    const initialMetadata = req.body?.dublinCore
      ? {
        dublinCore: req.body.dublinCore,
        cidocCrm: req.body.cidocCrm || {}
      }
      : {
        dublinCore: {
          title: project.name,
          description: project.description || undefined,
          date: new Date().toISOString().split('T')[0]
        },
        cidocCrm: {
          objectType: 'Digital Heritage Twin'
        }
      };
    console.log('HDT CREATE: initialMetadata:', JSON.stringify(initialMetadata, null, 2));

    // Create HDT document with metadata
    const document = await createHDTDocument(projectId, currentUser.sub, initialMetadata);
    console.log('HDT CREATE: created document:', JSON.stringify(document, null, 2));

    res.status(201).json(document);
  } catch (error: any) {
    console.error('Error creating HDT document:', error);
    res.status(500).json({
      error: 'Failed to create HDT document',
      message: error?.message || String(error)
    });
  }
}

/**
 * PUT /api/projects/:projectId/hdt
 * Update HDT metadata (manager only).
 */
export async function updateHDTMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);
    const metadataUpdates = req.body;

    console.log('HDT UPDATE: req.body:', JSON.stringify(req.body, null, 2));
    console.log('HDT UPDATE: metadataUpdates:', JSON.stringify(metadataUpdates, null, 2));

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can update HDT metadata' });
    }

    const updatedMetadata = await updateHDTMetadata(projectId, metadataUpdates, currentUser.sub);

    if (!updatedMetadata) {
      return res.status(404).json({ error: 'HDT metadata not found for this project' });
    }

    res.json(updatedMetadata);
  } catch (error: any) {
    console.error('Error updating HDT metadata:', error);
    res.status(500).json({
      error: 'Failed to update HDT metadata',
      message: error?.message || String(error)
    });
  }
}

/**
 * DELETE /api/projects/:projectId/hdt
 * Delete HDT document (manager only).
 */
export async function deleteHDTMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can delete HDT document' });
    }

    const deleted = await deleteHDTDocument(projectId);

    if (!deleted) {
      return res.status(404).json({ error: 'HDT document not found for this project' });
    }

    res.json({ message: 'HDT document deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting HDT document:', error);
    res.status(500).json({
      error: 'Failed to delete HDT document',
      message: error?.message || String(error)
    });
  }
}

// ============================================================================
// DIGITAL ASSETS ENDPOINTS
// ============================================================================

/**
 * POST /api/projects/:projectId/hdt/assets
 * Add a digital asset record to the HDT pool (metadata only).
 *
 * NOTE:
 * - For model3d, the binary file is uploaded via the "project files" endpoints
 *   and stored under:
 *     project_files/<projectId>/model3d/<assetId>/<filename>
 * - For rti, the RTI upload route stores a full folder under:
 *     project_files/<projectId>/rti/<assetId>/(info.json + data...)
 */
export async function addAssetHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);
    const assetData = req.body;

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can add assets' });
    }

    const updatedDoc = await addDigitalAsset(projectId, assetData, currentUser.sub);

    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document not found' });
    }

    // Keep derived scene descriptions in sync (used by the viewer).
    await generateAllSceneFiles(projectId);

    res.status(201).json({
      success: true,
      value: updatedDoc  // Frontend looks for json.value.digitalAssets
    });
  } catch (error: any) {
    console.error('Error adding asset:', error);
    res.status(500).json({
      error: 'Failed to add asset',
      message: error?.message || String(error)
    });
  }
}

/**
 * PUT /api/projects/:projectId/hdt/assets/:assetId
 * Update a digital asset record (manager only).
 */
export async function updateAssetHandler(req: Request, res: Response) {
  try {
    const { projectId, assetId } = req.params;
    const currentUser = getCurrentUser(req);
    const updates = req.body;

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can update assets' });
    }

    const updatedDoc = await updateDigitalAsset(projectId, assetId, updates, currentUser.sub);

    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document or asset not found' });
    }

    await generateAllSceneFiles(projectId);

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error updating asset:', error);
    res.status(500).json({
      error: 'Failed to update asset',
      message: error?.message || String(error)
    });
  }
}

/**
 * DELETE /api/projects/:projectId/hdt/assets/:assetId
 * Remove a digital asset from the HDT document (and from all scenes).
 *
 * Filesystem cleanup:
 * - If the asset is type "rti", remove the RTI folder:
 *     project_files/<projectId>/rti/<assetId>
 *
 * NOTE:
 * - model3d file cleanup is typically handled by the project files endpoints
 *   (or by a dedicated cleanup strategy if desired).
 */

export async function removeAssetHandler(req: Request, res: Response) {
  try {
    const { projectId, assetId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can remove assets' });
    }

    // 1) Retrieve current HDT document to inspect the asset before removal
    const hdtDoc = await getHDTDocument(projectId);
    if (!hdtDoc) {
      return res.status(404).json({ error: 'HDT document not found' });
    }

    const asset = Array.isArray((hdtDoc as any).digitalAssets)
      ? (hdtDoc as any).digitalAssets.find((a: any) => a.id === assetId)
      : undefined;

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found in HDT document' });
    }

    console.log('🗑️ [removeAssetHandler] Deleting asset:', {
      projectId,
      assetId,
      type: asset.type,
      fileName: asset.fileName,
      fileUrl: asset.fileUrl
    });

    // 2) Determine directory to delete based on asset type
    let assetDirToDelete: string | null = null;

    if (asset.type === 'model3d') {
      // 3D Model: project_files/<projectId>/model3d/<assetId>/
      assetDirToDelete = projectModel3dAssetDir(projectId, assetId);
      console.log('📁 [removeAssetHandler] 3D asset directory to delete:', assetDirToDelete);

    } else if (asset.type === 'rti') {
      // RTI: project_files/<projectId>/rti/<assetId>/
      assetDirToDelete = projectRtiAssetDir(projectId, assetId);
      console.log('📁 [removeAssetHandler] RTI asset directory to delete:', assetDirToDelete);

      // Fallback: try to resolve from fileUrl if standard path doesn't work
      if (!assetDirToDelete && typeof asset.fileUrl === 'string') {
        assetDirToDelete = resolveRtiAssetDirectory(asset.fileUrl) || null;
        console.log('📁 [removeAssetHandler] RTI fallback directory:', assetDirToDelete);
      }
    }

    // 3) Remove asset from HDT document (DB + scenes)
    console.log('📝 [removeAssetHandler] Removing from HDT document...');
    const updatedDoc = await removeDigitalAsset(projectId, assetId, currentUser.sub);
    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document not found after removal' });
    }

    // 4) Remove asset directory from filesystem if it exists
    if (assetDirToDelete) {
      try {
        // Check if directory exists first
        await fs.access(assetDirToDelete);

        // Remove directory and all contents
        await fs.rm(assetDirToDelete, { recursive: true, force: true });

        console.log('✅ [removeAssetHandler] Asset directory removed successfully:', {
          projectId,
          assetId,
          type: asset.type,
          directory: assetDirToDelete
        });
      } catch (fsErr: any) {
        console.warn('⚠️ [removeAssetHandler] Failed to remove asset directory:', {
          projectId,
          assetId,
          type: asset.type,
          directory: assetDirToDelete,
          error: fsErr.message || String(fsErr)
        });

        // Continue with response - don't block deletion if filesystem cleanup fails
        // This allows recovery from partial deletions
      }
    } else {
      console.warn('⚠️ [removeAssetHandler] No directory identified for deletion:', {
        projectId,
        assetId,
        type: asset.type
      });
    }

    // 5) Regenerate derived scene descriptions used by the viewer
    console.log('🔄 [removeAssetHandler] Regenerating scene files...');
    try {
      await generateAllSceneFiles(projectId);
    } catch (sceneErr: any) {
      console.warn('⚠️ [removeAssetHandler] Failed to regenerate scene files:', sceneErr.message);
      // Continue - scene regeneration failure shouldn't block deletion
    }

    console.log('✅ [removeAssetHandler] Asset deletion completed:', {
      projectId,
      assetId,
      type: asset.type
    });

    return res.json({
      success: true,
      message: `Asset "${asset.fileName || assetId}" deleted successfully`,
      updatedDoc
    });

  } catch (error: any) {
    console.error('❌ [removeAssetHandler] Error removing asset:', {
      error: error.message || String(error),
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Failed to remove asset',
      message: error?.message || String(error)
    });
  }
}

// ============================================================================
// SCENE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/projects/:projectId/scenes
 * List all available scene IDs (source of truth is MongoDB).
 */
export async function listScenesHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;

    const scenes = await getAvailableScenes(projectId);

    res.json(scenes);
  } catch (error: any) {
    console.error('Error listing scenes:', error);
    res.status(500).json({
      error: 'Failed to list scenes',
      message: error?.message || String(error)
    });
  }
}

/**
 * POST /api/projects/:projectId/hdt/scenes
 * Create a new scene (manager only).
 * Scene data is stored in MongoDB inside the HDT document.
 */
export async function createSceneHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = getCurrentUser(req);
    const sceneData = req.body;

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can create scenes' });
    }

    const updatedDoc = await addScene(projectId, sceneData, currentUser.sub);
    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document not found' });
    }

    const newScene = updatedDoc.scenes[updatedDoc.scenes.length - 1];

    // Keep derived scene description in sync (viewer reads /api/projects/:projectId/scenes/:sceneId).
    await generateSceneFile(projectId, newScene.id);

    res.status(201).json(updatedDoc);
  } catch (error: any) {
    console.error('Error creating scene:', error);
    res.status(500).json({
      error: 'Failed to create scene',
      message: error?.message || String(error)
    });
  }
}

/**
 * PUT /api/projects/:projectId/hdt/scenes/:sceneId
 * Update a scene (manager only).
 * Scene data is stored in MongoDB inside the HDT document.
 */
export async function updateSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const currentUser = getCurrentUser(req);
    const updates = req.body;

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can update scenes' });
    }

    const updatedDoc = await updateScene(projectId, sceneId, updates, currentUser.sub);
    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document or scene not found' });
    }

    await generateSceneFile(projectId, sceneId);

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error updating scene:', error);
    res.status(500).json({
      error: 'Failed to update scene',
      message: error?.message || String(error)
    });
  }
}

/**
 * DELETE /api/projects/:projectId/hdt/scenes/:sceneId
 * Delete a scene (manager only).
 * Scene data is removed from MongoDB (HDT document).
 *
 * NOTE:
 * If you also persist debug exports on disk, you may optionally remove them here.
 */
export async function deleteSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can delete scenes' });
    }

    const updatedDoc = await removeScene(projectId, sceneId, currentUser.sub);
    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document not found' });
    }

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error deleting scene:', error);
    res.status(500).json({
      error: 'Failed to delete scene',
      message: error?.message || String(error)
    });
  }
}

// ============================================================================
// SCENE-ASSET ASSOCIATION ENDPOINTS
// ============================================================================

/**
 * POST /api/projects/:projectId/hdt/scenes/:sceneId/assets
 * Add an asset reference to a scene (manager only).
 * This updates MongoDB and then refreshes the derived scene description.
 */
export async function addAssetToSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const currentUser = getCurrentUser(req);
    const assetReference = req.body;

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can modify scenes' });
    }

    const updatedDoc = await addAssetToScene(projectId, sceneId, assetReference, currentUser.sub);
    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document not found' });
    }

    await generateSceneFile(projectId, sceneId);

    res.status(201).json(updatedDoc);
  } catch (error: any) {
    console.error('Error adding asset to scene:', error);
    res.status(500).json({
      error: 'Failed to add asset to scene',
      message: error?.message || String(error)
    });
  }
}

/**
 * PUT /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId
 * Update a scene-asset reference (manager only), then refresh derived scene description.
 */
export async function updateAssetInSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId, assetId } = req.params;
    const currentUser = getCurrentUser(req);
    const updates = req.body;

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can modify scenes' });
    }

    const updatedDoc = await updateAssetInScene(projectId, sceneId, assetId, updates, currentUser.sub);
    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document not found' });
    }

    await generateSceneFile(projectId, sceneId);

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error updating asset in scene:', error);
    res.status(500).json({
      error: 'Failed to update asset in scene',
      message: error?.message || String(error)
    });
  }
}

/**
 * DELETE /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId
 * Remove an asset reference from a scene (manager only), then refresh derived scene description.
 */
export async function removeAssetFromSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId, assetId } = req.params;
    const currentUser = getCurrentUser(req);

    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can modify scenes' });
    }

    const updatedDoc = await removeAssetFromScene(projectId, sceneId, assetId, currentUser.sub);
    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document not found' });
    }

    await generateSceneFile(projectId, sceneId);

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error removing asset from scene:', error);
    res.status(500).json({
      error: 'Failed to remove asset from scene',
      message: error?.message || String(error)
    });
  }
}

// ============================================================================
// SCENE JSON (VIEWER + DEBUG EXPORT)
// ============================================================================

/**
 * GET /api/projects/:projectId/scenes/:sceneId
 * Returns a viewer-friendly scene description JSON.
 *
 * Source of truth:
 * - Scene definitions are stored in MongoDB (HDT document).
 *
 * This handler generates (or regenerates) a derived scene description from MongoDB
 * and returns it to the client. The returned JSON includes resolved asset URLs
 * (e.g. /assets/projects/<projectId>/model3d/<assetId>/<filename>).
 *
 * NOTE:
 * Even if you also export scene JSON to disk for debugging, the viewer should
 * rely on this endpoint.
 */
export async function getSceneFileHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;

    // ✅ SOLUZIONE: Se richiesta "default", trova scena con isDefault=true
    let targetSceneId = sceneId;

    if (sceneId === 'default') {
      // Trova la scena default reale
      const doc = await getHDTDocument(projectId);
      if (!doc) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const defaultScene = doc.scenes?.find((s: any) => s.isDefault === true);
      if (!defaultScene) {
        return res.status(404).json({ error: 'No default scene found' });
      }

      targetSceneId = defaultScene.id;
      console.log(`🎯 [SceneFile] Mapping 'default' to scene ID: ${targetSceneId}`);
    }

    const sceneDesc = await generateSceneFile(projectId, targetSceneId);
    if (sceneDesc) {
      return res.json(sceneDesc);
    }

    return res.status(404).json({ error: 'Scene not found in database' });
  } catch (error: any) {
    console.error('Error serving scene file:', error);
    res.status(500).json({
      error: 'Failed to serve scene file',
      message: error?.message || String(error)
    });
  }
}

/**
 * GET /api/projects/:projectId/scenes/:sceneId/export
 * Export a scene JSON description to disk and download it (debugging only).
 *
 * If you keep exported files on disk and want multiple scenes, a clean layout is:
 *   project_files/<projectId>/scenes/<sceneId>.json
 *
 * But this export is optional: scenes are already stored in MongoDB.
 */
export async function exportSceneFileHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;

    if (!projectId || !sceneId) {
      return res.status(400).json({ error: 'Project ID and Scene ID are required' });
    }

    const sceneDesc = await generateSceneFile(projectId, sceneId);
    if (!sceneDesc) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${projectId}-${sceneId}.json"`);
    res.json(sceneDesc);
  } catch (error: any) {
    console.error('Error exporting scene:', error);
    res.status(500).json({
      error: 'Failed to export scene',
      message: error?.message || String(error)
    });
  }
}
