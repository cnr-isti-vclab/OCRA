/**
 * Admin User Management Controller
 * 
 * Handles admin-level user operations including creating users and managing privileges
 */

import { Request, Response } from 'express';
import { getPrismaClient } from '../../db.js';
import { logAuditEvent } from '../../db.js';
import type { User } from '../types/index.js';

/**
 * Get current user from request (helper)
 */
async function getCurrentUser(req: Request): Promise<User | null> {
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
 * Create a new user (admin only)
 * POST /api/admin/users
 * Body: { sub, email, username, name?, given_name?, family_name?, sys_admin?, sys_creator? }
 */
export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const { sub, email, username, name, given_name, family_name, sys_admin, sys_creator } = req.body;
    
    // Validate required fields
    if (!sub || !email) {
      res.status(400).json({ error: 'sub and email are required' });
      return;
    }
    
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    if (!currentUser.sys_admin) {
      // Log unauthorized attempt
      try {
        await logAuditEvent({
          userSub: currentUser.sub,
          eventType: 'user.create',
          success: false,
          userAgent: req.headers['user-agent'] || null,
          ipAddress: req.ip || req.connection.remoteAddress || null,
          payload: { targetEmail: email, error: 'Unauthorized - not admin' }
        });
      } catch (auditErr) {
        console.warn('Failed to log audit event:', auditErr);
      }
      
      res.status(403).json({ error: 'Only administrators can create users' });
      return;
    }
    
    const db = getPrismaClient();
    
    // Check if user already exists
    const existingUser = await db.user.findFirst({
      where: {
        OR: [
          { sub },
          { email }
        ]
      }
    });
    
    if (existingUser) {
      res.status(409).json({ error: 'User with this sub or email already exists' });
      return;
    }
    
    // Create the user
    const newUser = await db.user.create({
      data: {
        sub,
        email,
        username: username || email.split('@')[0],
        name: name || null,
        given_name: given_name || null,
        family_name: family_name || null,
        sys_admin: sys_admin || false,
        sys_creator: sys_creator || false
      }
    });
    
    // Log successful creation
    try {
      await logAuditEvent({
        userSub: currentUser.sub,
        eventType: 'user.create',
        success: true,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || req.connection.remoteAddress || null,
        payload: {
          createdUserId: newUser.id,
          createdEmail: newUser.email,
          createdUsername: newUser.username,
          sys_admin: newUser.sys_admin,
          sys_creator: newUser.sys_creator
        }
      });
    } catch (auditErr) {
      console.warn('Failed to log audit event:', auditErr);
    }
    
    res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        sub: newUser.sub,
        email: newUser.email,
        username: newUser.username,
        name: newUser.name,
        given_name: newUser.given_name,
        family_name: newUser.family_name,
        sys_admin: newUser.sys_admin,
        sys_creator: newUser.sys_creator,
        createdAt: newUser.createdAt
      }
    });
    
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      error: 'Failed to create user',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Update user privileges (sys_admin, sys_creator) - admin only
 * PUT /api/admin/users/:userId/privileges
 * Body: { sys_admin?: boolean, sys_creator?: boolean }
 */
export async function updateUserPrivileges(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { sys_admin, sys_creator } = req.body;
    
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }
    
    if (sys_admin === undefined && sys_creator === undefined) {
      res.status(400).json({ error: 'At least one privilege field (sys_admin or sys_creator) must be provided' });
      return;
    }
    
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    if (!currentUser.sys_admin) {
      // Log unauthorized attempt
      try {
        await logAuditEvent({
          userSub: currentUser.sub,
          eventType: 'user.privileges.update',
          success: false,
          userAgent: req.headers['user-agent'] || null,
          ipAddress: req.ip || req.connection.remoteAddress || null,
          payload: { targetUserId: userId, error: 'Unauthorized - not admin' }
        });
      } catch (auditErr) {
        console.warn('Failed to log audit event:', auditErr);
      }
      
      res.status(403).json({ error: 'Only administrators can update user privileges' });
      return;
    }
    
    const db = getPrismaClient();
    
    // Check if target user exists
    const targetUser = await db.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    // Prepare update data
    const updateData: any = { updatedAt: new Date() };
    if (sys_admin !== undefined) updateData.sys_admin = sys_admin;
    if (sys_creator !== undefined) updateData.sys_creator = sys_creator;
    
    // Update the user
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: updateData
    });
    
    // Log successful update
    try {
      await logAuditEvent({
        userSub: currentUser.sub,
        eventType: 'user.privileges.update',
        success: true,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || req.connection.remoteAddress || null,
        payload: {
          targetUserId: userId,
          targetEmail: updatedUser.email,
          targetUsername: updatedUser.username,
          previousPrivileges: {
            sys_admin: targetUser.sys_admin,
            sys_creator: targetUser.sys_creator
          },
          newPrivileges: {
            sys_admin: updatedUser.sys_admin,
            sys_creator: updatedUser.sys_creator
          }
        }
      });
    } catch (auditErr) {
      console.warn('Failed to log audit event:', auditErr);
    }
    
    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        name: updatedUser.name,
        sys_admin: updatedUser.sys_admin,
        sys_creator: updatedUser.sys_creator,
        updatedAt: updatedUser.updatedAt
      }
    });
    
  } catch (error) {
    console.error('Error updating user privileges:', error);
    res.status(500).json({
      error: 'Failed to update user privileges',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Batch create users (admin only) - useful for seeding
 * POST /api/admin/users/batch
 * Body: { users: Array<{ sub, email, username?, ... }> }
 */
export async function batchCreateUsers(req: Request, res: Response): Promise<void> {
  try {
    const { users } = req.body;
    
    if (!Array.isArray(users) || users.length === 0) {
      res.status(400).json({ error: 'users array is required and must not be empty' });
      return;
    }
    
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    if (!currentUser.sys_admin) {
      res.status(403).json({ error: 'Only administrators can batch create users' });
      return;
    }
    
    const db = getPrismaClient();
    const results = {
      created: [] as any[],
      skipped: [] as any[],
      errors: [] as any[]
    };
    
    for (const userData of users) {
      try {
        const { sub, email, username, name, given_name, family_name, sys_admin, sys_creator } = userData;
        
        if (!sub || !email) {
          results.errors.push({ email, error: 'Missing required fields (sub, email)' });
          continue;
        }
        
        // Check if user exists
        const existing = await db.user.findFirst({
          where: {
            OR: [{ sub }, { email }]
          }
        });
        
        if (existing) {
          results.skipped.push({ email, reason: 'User already exists' });
          continue;
        }
        
        // Create user
        const newUser = await db.user.create({
          data: {
            sub,
            email,
            username: username || email.split('@')[0],
            name: name || null,
            given_name: given_name || null,
            family_name: family_name || null,
            sys_admin: sys_admin || false,
            sys_creator: sys_creator || false
          }
        });
        
        results.created.push({
          id: newUser.id,
          email: newUser.email,
          username: newUser.username
        });
        
      } catch (error) {
        results.errors.push({
          email: userData.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Log batch operation
    try {
      await logAuditEvent({
        userSub: currentUser.sub,
        eventType: 'user.batch.create',
        success: true,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || req.connection.remoteAddress || null,
        payload: {
          totalRequested: users.length,
          created: results.created.length,
          skipped: results.skipped.length,
          errors: results.errors.length
        }
      });
    } catch (auditErr) {
      console.warn('Failed to log audit event:', auditErr);
    }
    
    res.json({
      success: true,
      summary: {
        total: users.length,
        created: results.created.length,
        skipped: results.skipped.length,
        errors: results.errors.length
      },
      results
    });
    
  } catch (error) {
    console.error('Error batch creating users:', error);
    res.status(500).json({
      error: 'Failed to batch create users',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
