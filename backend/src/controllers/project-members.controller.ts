/**
 * Project Members Controller
 * 
 * Handles project membership management - adding, removing, and listing users assigned to projects
 */

import { Request, Response } from 'express';
import { getPrismaClient } from '../../db.js';
import { RoleEnum } from '@prisma/client';
import type { User } from '../types/index.js';
import { auditBestEffort } from '../utils/audit.js';

/**
 * Get current user from request (helper)
 */
async function getCurrentUser(req: Request): Promise<User | null> {
  // TEST MODE: Allow bypassing auth with X-Test-User-Id header
  if (process.env.NODE_ENV === 'test') {
    const testUserId = req.headers['x-test-user-id'] as string;
    if (testUserId) {
      const db = getPrismaClient();
      const dbUser = await db.user.findUnique({ where: { id: testUserId } });
      if (dbUser) return dbUser as User;
    }
  }
  
  const { getValidSession } = await import('../../db.js');
  
  let sessionId = req.cookies?.session_id;
  if (!sessionId && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7);
    }
  }
  if (!sessionId && req.query.session_id) {
    sessionId = req.query.session_id as string;
  }
  
  if (!sessionId) return null;
  
  const session = await getValidSession(sessionId);
  if (!session?.user) return null;
  
  const db = getPrismaClient();
  const dbUser = await db.user.findUnique({ where: { sub: session.user.sub } });
  if (!dbUser) return null;
  
  return { ...session.user, id: dbUser.id };
}

/**
 * Check if user is admin or manager of project
 */
async function canManageProject(user: User, projectId: string): Promise<boolean> {
  if (user.sys_admin) return true;
  
  const db = getPrismaClient();
  const role = await db.projectRole.findFirst({
    where: {
      projectId,
      userId: user.id,
      role: RoleEnum.manager
    }
  });
  
  return !!role;
}

/**
 * List all members of a project with their roles
 * GET /api/projects/:projectId/members
 */
export async function listProjectMembers(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required' });
      return;
    }
    
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    const db = getPrismaClient();
    
    // Verify project exists
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    
    // Get all project roles with user details
    const projectRoles = await db.projectRole.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            given_name: true,
            family_name: true,
            sys_admin: true,
            sys_creator: true
          }
        }
      },
      orderBy: [
        { role: 'asc' },
        { user: { name: 'asc' } }
      ]
    });
    
    const members = projectRoles.map(pr => ({
      userId: pr.user.id,
      email: pr.user.email,
      username: pr.user.username,
      name: pr.user.name,
      given_name: pr.user.given_name,
      family_name: pr.user.family_name,
      role: pr.role,
      assignedAt: pr.createdAt,
      sys_admin: pr.user.sys_admin,
      sys_creator: pr.user.sys_creator
    }));
    
    res.json({ 
      projectId,
      projectName: project.name,
      members 
    });
    
  } catch (error) {
    console.error('Error listing project members:', error);
    res.status(500).json({ 
      error: 'Failed to list project members', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Add or update a member's role in a project
 * POST /api/projects/:projectId/members
 * Body: { userId?: string, email?: string, role: 'manager' | 'editor' | 'viewer' }
 */
export async function addProjectMember(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    const { userId, email, role } = req.body;
    
    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required' });
      return;
    }
    
    if (!role || !['manager', 'editor', 'viewer'].includes(role)) {
      res.status(400).json({ error: 'Valid role is required (manager, editor, or viewer)' });
      return;
    }
    
    if (!userId && !email) {
      res.status(400).json({ error: 'Either userId or email is required' });
      return;
    }
    
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    const db = getPrismaClient();
    
    // Verify project exists
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    
    // Check if current user can manage this project
    const canManage = await canManageProject(currentUser, projectId);
    if (!canManage) {
      // Log unauthorized attempt
      await auditBestEffort({
        req,
        userSub: currentUser.sub,
        action: 'project.member.add',
        success: false,
        payload: { projectId, targetUserId: userId, targetEmail: email, role, error: 'Unauthorized' }
      });
      
      res.status(403).json({ error: 'Only project managers and admins can manage project members' });
      return;
    }
    
    // Find the target user
    let targetUser;
    if (userId) {
      targetUser = await db.user.findUnique({ where: { id: userId } });
    } else {
      targetUser = await db.user.findUnique({ where: { email } });
    }
    
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    // Create or update project role
    const projectRole = await db.projectRole.upsert({
      where: {
        userId_projectId: {
          userId: targetUser.id,
          projectId
        }
      },
      update: {
        role: role as RoleEnum,
        updatedAt: new Date()
      },
      create: {
        userId: targetUser.id,
        projectId,
        role: role as RoleEnum
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true
          }
        }
      }
    });
    
    // Log successful operation
    await auditBestEffort({
      req,
      userSub: currentUser.sub,
      action: 'project.member.add',
      success: true,
      payload: { 
        projectId, 
        projectName: project.name,
        targetUserId: targetUser.id, 
        targetEmail: targetUser.email,
        targetUsername: targetUser.username,
        role: role 
      }
    });
    
    res.json({ 
      success: true,
      member: {
        userId: projectRole.user.id,
        email: projectRole.user.email,
        username: projectRole.user.username,
        name: projectRole.user.name,
        role: projectRole.role,
        assignedAt: projectRole.createdAt
      }
    });
    
  } catch (error) {
    console.error('Error adding project member:', error);
    res.status(500).json({ 
      error: 'Failed to add project member', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Remove a member from a project
 * DELETE /api/projects/:projectId/members/:userId
 */
export async function removeProjectMember(req: Request, res: Response): Promise<void> {
  try {
    const { projectId, userId } = req.params;
    
    if (!projectId || !userId) {
      res.status(400).json({ error: 'Project ID and User ID are required' });
      return;
    }
    
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    const db = getPrismaClient();
    
    // Verify project exists
    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    
    // Check if current user can manage this project
    const canManage = await canManageProject(currentUser, projectId);
    if (!canManage) {
      // Log unauthorized attempt
      await auditBestEffort({
        req,
        userSub: currentUser.sub,
        action: 'project.member.remove',
        success: false,
        payload: { projectId, targetUserId: userId, error: 'Unauthorized' }
      });
      
      res.status(403).json({ error: 'Only project managers and admins can manage project members' });
      return;
    }
    
    // Find the target user for logging
    const targetUser = await db.user.findUnique({ where: { id: userId } });
    
    // Check if role exists
    const existingRole = await db.projectRole.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId
        }
      }
    });
    
    if (!existingRole) {
      res.status(404).json({ error: 'User is not a member of this project' });
      return;
    }
    
    // Delete the project role
    await db.projectRole.delete({
      where: {
        userId_projectId: {
          userId,
          projectId
        }
      }
    });
    
    // Log successful operation
    await auditBestEffort({
      req,
      userSub: currentUser.sub,
      action: 'project.member.remove',
      success: true,
      payload: { 
        projectId,
        projectName: project.name,
        targetUserId: userId,
        targetEmail: targetUser?.email,
        targetUsername: targetUser?.username,
        previousRole: existingRole.role
      }
    });
    
    res.json({ 
      success: true,
      message: 'Member removed from project'
    });
    
  } catch (error) {
    console.error('Error removing project member:', error);
    res.status(500).json({ 
      error: 'Failed to remove project member', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}
