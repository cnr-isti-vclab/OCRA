import { Request, Response } from 'express';
import { getPrismaClient } from '../../db.js';

/**
 * USER MANAGEMENT CONTROLLER (TypeScript version)
 * 
 * Handles user-related API endpoints including listing all users,
 * user profile management, and admin operations.
 */

/**
 * Get all users in the system
 * Requires authentication (and potentially admin privileges)
 */
export async function getAllUsers(req: Request, res: Response): Promise<void> {
  try {
    const db = getPrismaClient();
    
    // Get all users with basic information
    const users = await db.user.findMany({
      select: {
        id: true,
        sub: true,
        email: true,
        name: true,
        username: true,
        given_name: true,
        family_name: true,
        middle_name: true,
        sys_admin: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      error: 'Failed to fetch users',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get all users with project management statistics
 * Requires authentication and admin privileges
 */
export async function getAllUsersWithStats(req: Request, res: Response): Promise<void> {
  try {
    const db = getPrismaClient();
    
    // Get all users with basic information
    const users = await db.user.findMany({
      select: {
        id: true,
        sub: true,
        email: true,
        name: true,
        username: true,
        given_name: true,
        family_name: true,
        middle_name: true,
        sys_admin: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get project management counts for all users
    const managedProjectCounts = await db.projectRole.groupBy({
      by: ['userId'],
      where: {
        roleId: 'manager'
      },
      _count: {
        projectId: true
      }
    });

    // Get last login information for all users
    const lastLogins = await db.loginEvent.findMany({
      where: {
        eventType: 'login',
        success: true
      },
      select: {
        userSub: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      distinct: ['userSub']
    });

    // Create a map of userId to project count
    const projectCountMap = new Map(
      managedProjectCounts.map((item: any) => [item.userId, item._count.projectId])
    );

    // Create a map of userSub to last login date
    const lastLoginMap = new Map(
      lastLogins.map((login: any) => [login.userSub, login.createdAt])
    );

    // Enrich users with project management statistics and last login
    const usersWithStats = users.map((user: any) => ({
      ...user,
      managedProjectsCount: projectCountMap.get(user.id) || 0,
      lastLoginAt: lastLoginMap.get(user.sub) || null
    }));

    res.json(usersWithStats);
  } catch (error) {
    console.error('Error fetching users with stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch users with statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get a specific user by ID
 */
export async function getUserById(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      res.status(400).json({
        error: 'User ID is required'
      });
      return;
    }
    
    const db = getPrismaClient();
    
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        sub: true,
        email: true,
        name: true,
        username: true,
        given_name: true,
        family_name: true,
        middle_name: true,
        sys_admin: true,
        createdAt: true,
        updatedAt: true,
      }
    });
    
    if (!user) {
      res.status(404).json({
        error: 'User not found'
      });
      return;
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Update user admin status
 * This is a privileged operation
 */
export async function updateUserAdminStatus(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { sys_admin } = req.body;
    
    if (!userId) {
      res.status(400).json({
        error: 'User ID is required'
      });
      return;
    }
    
    if (typeof sys_admin !== 'boolean') {
      res.status(400).json({
        error: 'sys_admin must be a boolean value'
      });
      return;
    }
    
    const db = getPrismaClient();
    
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { 
        sys_admin,
        updatedAt: new Date()
      },
      select: {
        id: true,
        sub: true,
        email: true,
        name: true,
        username: true,
        sys_admin: true,
        updatedAt: true,
      }
    });
    
    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating user admin status:', error);
    
    if ((error as any)?.code === 'P2025') {
      res.status(404).json({
        error: 'User not found'
      });
      return;
    }
    
    res.status(500).json({ 
      error: 'Failed to update user admin status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}