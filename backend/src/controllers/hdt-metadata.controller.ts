/**
 * HDT Metadata Controller
 * 
 * Handles HTTP requests for managing Heritage Digital Twin metadata.
 */

import { Request, Response } from 'express';
import {
  getHDTMetadata,
  createHDTMetadata,
  updateHDTMetadata,
  deleteHDTMetadata,
  initializeHDTMetadata
} from '../services/hdt-metadata.service.js';
import { getPrismaClient } from '../../db.js';
import { User } from '../types/index.js';
import { RoleEnum } from '@prisma/client';

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

/**
 * GET /api/projects/:projectId/hdt
 * Get HDT metadata for a project
 */
export async function getHDTMetadataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }
    
    const metadata = await getHDTMetadata(projectId);
    
    if (!metadata) {
      return res.status(404).json({ error: 'HDT metadata not found for this project' });
    }
    
    res.json(metadata);
  } catch (error: any) {
    console.error('Error fetching HDT metadata:', error);
    res.status(500).json({ 
      error: 'Failed to fetch HDT metadata',
      message: error?.message || String(error)
    });
  }
}

/**
 * POST /api/projects/:projectId/hdt
 * Create or initialize HDT metadata for a project
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
      return res.status(403).json({ error: 'Only project managers can create HDT metadata' });
    }
    
    // Check if metadata already exists
    const existing = await getHDTMetadata(projectId);
    if (existing) {
      return res.status(409).json({ 
        error: 'HDT metadata already exists for this project',
        metadata: existing
      });
    }
    
    // Get project details to initialize metadata
    const prisma = getPrismaClient();
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true,
        public: true
      }
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Initialize metadata with project data
    const metadata = await initializeHDTMetadata(
      projectId,
      project.name,
      project.description || undefined,
      project.public,
      currentUser.sub
    );
    
    res.status(201).json(metadata);
  } catch (error: any) {
    console.error('Error creating HDT metadata:', error);
    res.status(500).json({ 
      error: 'Failed to create HDT metadata',
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
 * Delete HDT metadata for a project
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
      return res.status(403).json({ error: 'Only project managers can delete HDT metadata' });
    }
    
    const deleted = await deleteHDTMetadata(projectId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'HDT metadata not found for this project' });
    }
    
    res.json({ message: 'HDT metadata deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting HDT metadata:', error);
    res.status(500).json({ 
      error: 'Failed to delete HDT metadata',
      message: error?.message || String(error)
    });
  }
}
