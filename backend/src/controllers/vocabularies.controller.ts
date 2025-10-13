import type { Request, Response } from 'express';
import { getPrismaClient } from '../../db.js';
import type { User } from '../types/index.js';

/**
 * Get current user from session (if authenticated)
 */
async function getCurrentUser(req: Request): Promise<User | null> {
  try {
    // Get session ID from cookie
    let sessionId = req.cookies?.session_id;
    
    if (!sessionId) {
      return null;
    }
    
    const { getValidSession } = await import('../../db.js');
    const session = await getValidSession(sessionId);
    
    if (!session || !session.user) {
      return null;
    }
    
    return session.user as User;
  } catch (error: any) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Get all vocabularies in the system
 * For authenticated users: show all vocabularies they have access to
 * For unauthenticated users: show only public vocabularies
 */
export async function getAllVocabularies(req: Request, res: Response): Promise<void> {
  console.log('🚀 [getAllVocabularies] Request received');
  
  try {
    const db = getPrismaClient();
    console.log('✅ [getAllVocabularies] Database client obtained');
    
    // Check if user is authenticated
    const currentUser = await getCurrentUser(req);
    
    if (currentUser) {
      console.log('👤 [getAllVocabularies] User authenticated:', {
        email: currentUser.email,
        username: currentUser.username,
        sys_admin: currentUser.sys_admin
      });
    } else {
      console.log('🚫 [getAllVocabularies] No authenticated user found');
    }
    
    // Build filter based on authentication status
    let whereClause;
    if (currentUser) {
      // For sysadmin: show ALL vocabularies
      if (currentUser.sys_admin) {
        console.log('🔑 [getAllVocabularies] Sysadmin detected - showing ALL vocabularies');
        whereClause = {};
      } else {
        console.log('👥 [getAllVocabularies] Regular user - showing all vocabularies');
        // For regular authenticated users: show all vocabularies (public or private)
        whereClause = {};
      }
    } else {
      console.log('🌍 [getAllVocabularies] Unauthenticated user - showing only public vocabularies');
      // For unauthenticated users: show only public vocabularies
      whereClause = { public: true };
    }
    
    console.log('🔍 [getAllVocabularies] Database query filter:', JSON.stringify(whereClause, null, 2));
    
    // Get vocabularies
    const vocabularies = await db.vocabulary.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    console.log(`✅ [getAllVocabularies] Found ${vocabularies.length} vocabularies`);
    
    res.json({ vocabularies });
  } catch (error: any) {
    console.error('❌ [getAllVocabularies] Error fetching vocabularies:', error);
    res.status(500).json({ 
      error: 'Failed to fetch vocabularies', 
      message: error?.message || 'Unknown error' 
    });
  }
}

/**
 * Get a single vocabulary by ID
 * GET /api/vocabularies/:vocabularyId
 */
export async function getVocabularyById(req: Request, res: Response): Promise<void> {
  const { vocabularyId } = req.params;
  
  if (!vocabularyId) {
    res.status(400).json({ error: 'Vocabulary ID is required' });
    return;
  }
  
  try {
    const db = getPrismaClient();
    const currentUser = await getCurrentUser(req);
    
    const vocabulary = await db.vocabulary.findUnique({
      where: { id: vocabularyId },
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true
      }
    });
    
    if (!vocabulary) {
      res.status(404).json({ error: 'Vocabulary not found' });
      return;
    }
    
    // Check access: public vocabularies are accessible to all, private only to authenticated users
    if (!vocabulary.public && !currentUser) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    res.json({ vocabulary });
  } catch (error: any) {
    console.error('❌ Error fetching vocabulary:', error);
    res.status(500).json({ 
      error: 'Failed to fetch vocabulary', 
      message: error?.message || 'Unknown error' 
    });
  }
}

/**
 * Create a new vocabulary (admin only)
 * POST /api/vocabularies
 */
export async function createVocabulary(req: Request, res: Response): Promise<void> {
  try {
    const currentUser = await getCurrentUser(req);
    
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    // Only sysadmin can create vocabularies
    if (!currentUser.sys_admin) {
      res.status(403).json({ error: 'Only system administrators can create vocabularies' });
      return;
    }
    
    const { name, description, public: isPublic } = req.body;
    
    if (!name || !description) {
      res.status(400).json({ error: 'Name and description are required' });
      return;
    }
    
    const db = getPrismaClient();
    
    const vocabulary = await db.vocabulary.create({
      data: {
        name,
        description,
        public: isPublic !== undefined ? isPublic : false
      }
    });
    
    console.log(`✅ Vocabulary '${name}' created by ${currentUser.username}`);
    res.status(201).json({ vocabulary });
  } catch (error: any) {
    console.error('❌ Error creating vocabulary:', error);
    res.status(500).json({ 
      error: 'Failed to create vocabulary', 
      message: error?.message || 'Unknown error' 
    });
  }
}

/**
 * Update a vocabulary (admin only)
 * PUT /api/vocabularies/:vocabularyId
 */
export async function updateVocabulary(req: Request, res: Response): Promise<void> {
  const { vocabularyId } = req.params;
  
  if (!vocabularyId) {
    res.status(400).json({ error: 'Vocabulary ID is required' });
    return;
  }
  
  try {
    const currentUser = await getCurrentUser(req);
    
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    // Only sysadmin can update vocabularies
    if (!currentUser.sys_admin) {
      res.status(403).json({ error: 'Only system administrators can update vocabularies' });
      return;
    }
    
    const { name, description, public: isPublic } = req.body;
    
    const db = getPrismaClient();
    
    const vocabulary = await db.vocabulary.update({
      where: { id: vocabularyId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(isPublic !== undefined && { public: isPublic })
      }
    });
    
    console.log(`✅ Vocabulary '${vocabulary.name}' updated by ${currentUser.username}`);
    res.json({ vocabulary });
  } catch (error: any) {
    console.error('❌ Error updating vocabulary:', error);
    res.status(500).json({ 
      error: 'Failed to update vocabulary', 
      message: error?.message || 'Unknown error' 
    });
  }
}

/**
 * Delete a vocabulary (admin only)
 * DELETE /api/vocabularies/:vocabularyId
 */
export async function deleteVocabulary(req: Request, res: Response): Promise<void> {
  const { vocabularyId } = req.params;
  
  if (!vocabularyId) {
    res.status(400).json({ error: 'Vocabulary ID is required' });
    return;
  }
  
  try {
    const currentUser = await getCurrentUser(req);
    
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    // Only sysadmin can delete vocabularies
    if (!currentUser.sys_admin) {
      res.status(403).json({ error: 'Only system administrators can delete vocabularies' });
      return;
    }
    
    const db = getPrismaClient();
    
    await db.vocabulary.delete({
      where: { id: vocabularyId }
    });
    
    console.log(`✅ Vocabulary deleted by ${currentUser.username}`);
    res.json({ message: 'Vocabulary deleted successfully' });
  } catch (error: any) {
    console.error('❌ Error deleting vocabulary:', error);
    res.status(500).json({ 
      error: 'Failed to delete vocabulary', 
      message: error?.message || 'Unknown error' 
    });
  }
}
