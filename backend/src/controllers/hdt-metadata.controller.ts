/**
 * HDT Metadata Controller
 * 
 * Handles HTTP requests for managing Heritage Digital Twin documents.
 * Includes metadata, digital assets, scenes, and scene-asset associations.
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
import fs from 'fs';
import path from 'path';

/**
 * Get current user from request
 */
function getCurrentUser(req: Request): User | null {
  return req.user || null;
}

/**
 * Check if user is manager of project
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

// RTI Helpers

/**
 * Base folder for all RTI assets (must match rti-asset.controller.ts).
 */
const rtiAssetsRoot =
  process.env.RTI_ASSETS_PATH || path.join(process.cwd(), 'rti_assets');

/**
 * Given an RTI asset fileUrl, return the directory on disk that stores the asset.
 *
 * Expected URL format:
 *   /assets/rti/<projectId>/<slug>/info.json
 * or absolute variants like:
 *   http://host:port/assets/rti/<projectId>/<slug>/info.json
 *
 * This function extracts <projectId> and <slug> and returns:
 *   rti_assets/<projectId>/<slug>
 *
 * Returns null if the URL does not match the expected RTI structure.
 */
function resolveRtiAssetDirectory(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;

  let urlPath = fileUrl;

  // If absolute URL, extract only the pathname
  try {
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      const url = new URL(fileUrl);
      urlPath = url.pathname;
    }
  } catch {
    // If parsing fails, keep the original string
    urlPath = fileUrl;
  }

  const prefix = '/assets/rti/';
  const idx = urlPath.indexOf(prefix);
  if (idx === -1) return null;

  // Strip "/assets/rti/" prefix -> "projectId/slug/info.json"
  const relative = urlPath.slice(idx + prefix.length);
  const segments = relative.split('/').filter(Boolean);

  // Expect at least: projectId, slug
  if (segments.length < 2) return null;

  const projectId = segments[0];
  const slug = segments[1];

  return path.join(rtiAssetsRoot, projectId, slug);
}


/**
 * GET /api/projects/:projectId/hdt
 * Get HDT document for a project
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
 * Create or initialize HDT document for a project
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
    const initialMetadata = req.body?.dublinCore ? {
      dublinCore: req.body.dublinCore,
      cidocCrm: req.body.cidocCrm || {}
    } : {
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
    const document = await createHDTDocument(
      projectId,
      currentUser.sub,
      initialMetadata
    );
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
 * Update HDT metadata for a project
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

    // Check if user is manager of the project
    const isManager = await checkIsManagerOfProject(currentUser.sub, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can update HDT metadata' });
    }

    // Update metadata
    const updatedMetadata = await updateHDTMetadata(
      projectId,
      metadataUpdates,
      currentUser.sub
    );

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
 * Delete HDT document for a project
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

    // Check if user is manager of the project
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

// ==========================================
// DIGITAL ASSETS ENDPOINTS
// ==========================================

/**
 * POST /api/projects/:projectId/hdt/assets
 * Add a digital asset to the pool
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

    // Regenerate scene files if asset is used in any scenes
    await generateAllSceneFiles(projectId);

    res.status(201).json(updatedDoc);
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
 * Update a digital asset
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

    // Regenerate scene files
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
 * Removes a digital asset from the HDT document (and from all scenes).
 *
 * If the asset is of type "rti", the corresponding RTI directory
 * on disk is also removed (rti_assets/<projectId>/<slug>).
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

    // 2) If the asset is an RTI, compute the directory to delete
    let rtiDirToDelete: string | null = null;
    if (asset.type === 'rti' && typeof asset.fileUrl === 'string') {
      rtiDirToDelete = resolveRtiAssetDirectory(asset.fileUrl);
      console.log('RTI asset delete requested:', {
        projectId,
        assetId,
        fileUrl: asset.fileUrl,
        rtiDirToDelete
      });
    }

    // 3) Remove asset from HDT document (DB + scenes)
    const updatedDoc = await removeDigitalAsset(projectId, assetId, currentUser.sub);

    if (!updatedDoc) {
      return res.status(404).json({ error: 'HDT document not found after removal' });
    }

    // 4) If RTI directory was identified, remove it from filesystem
    if (rtiDirToDelete) {
      try {
        await fs.promises.rm(rtiDirToDelete, { recursive: true, force: true });
        console.log('RTI asset directory removed successfully', {
          projectId,
          assetId,
          rtiDirToDelete
        });
      } catch (fsErr) {
        console.warn('Failed to remove RTI asset directory', {
          projectId,
          assetId,
          rtiDirToDelete,
          error: fsErr
        });
        // Do not block DELETE request if filesystem cleanup fails
      }
    }

    // 5) Regenerate all scene files consuming the updated HDT
    await generateAllSceneFiles(projectId);

    return res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error removing asset:', error);
    return res.status(500).json({
      error: 'Failed to remove asset',
      message: error?.message || String(error)
    });
  }
}


// ==========================================
// SCENE MANAGEMENT ENDPOINTS
// ==========================================

/**
 * GET /api/projects/:projectId/scenes
 * List all available scenes for a project
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
 * Create a new scene
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

    // Find the newly created scene
    const newScene = updatedDoc.scenes[updatedDoc.scenes.length - 1];

    // Generate scene file
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
 * Update a scene
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

    // Regenerate scene file
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
 * Delete a scene
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

    // TODO: Delete scene file from filesystem

    res.json(updatedDoc);
  } catch (error: any) {
    console.error('Error deleting scene:', error);
    res.status(500).json({
      error: 'Failed to delete scene',
      message: error?.message || String(error)
    });
  }
}

// ==========================================
// SCENE-ASSET ASSOCIATION ENDPOINTS
// ==========================================

/**
 * POST /api/projects/:projectId/hdt/scenes/:sceneId/assets
 * Add an asset to a scene
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

    // Regenerate scene file
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
 * Update an asset reference in a scene
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

    // Regenerate scene file
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
 * Remove an asset from a scene
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

    // Regenerate scene file
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

// ==========================================
// SCENE FILE SERVING
// ==========================================

/**
 * GET /api/projects/:projectId/scenes/:sceneId
 * Get a specific scene JSON file (for ThreePresenter)
 */
export async function getSceneFileHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;

    if (!projectId || !sceneId) {
      return res.status(400).json({ error: 'Project ID and Scene ID are required' });
    }

    // Always regenerate scene file from MongoDB to ensure it's up to date
    try {
      const sceneDesc = await generateSceneFile(projectId, sceneId);
      if (sceneDesc) {
        return res.json(sceneDesc);
      }
    } catch (genError) {
      console.error('Failed to generate scene file:', genError);
      return res.status(500).json({ error: 'Failed to generate scene file' });
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
 * Export scene JSON file to disk and download (for debugging)
 */
export async function exportSceneFileHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;

    if (!projectId || !sceneId) {
      return res.status(400).json({ error: 'Project ID and Scene ID are required' });
    }

    const { exportSceneFile } = await import('../services/hdt-metadata.service.js');
    const sceneDesc = await exportSceneFile(projectId, sceneId);

    if (!sceneDesc) {
      return res.status(404).json({ error: 'Scene not found' });
    }

    // Return the JSON for download
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
