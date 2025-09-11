import { getPrismaClient } from '../../db.js';

/**
 * USER MANAGEMENT CONTROLLER
 * 
 * Handles user-related API endpoints including listing all users,
 * user profile management, and admin operations.
 */

/**
 * Get all users in the system
 * Requires authentication (and potentially admin privileges)
 */
export async function getAllUsers(req, res) {
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
      message: error.message 
    });
  }
}

/**
 * Get a specific user by ID
 */
export async function getUserById(req, res) {
  try {
    const { id } = req.params;
    const db = getPrismaClient();
    
    const user = await db.user.findUnique({
      where: { id: parseInt(id) },
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
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user',
      message: error.message 
    });
  }
}

/**
 * Update user admin status (admin only operation)
 */
export async function updateUserAdminStatus(req, res) {
  try {
    const { id } = req.params;
    const { sys_admin } = req.body;
    const db = getPrismaClient();
    
    // TODO: Add authorization check to ensure only admins can do this
    
    const updatedUser = await db.user.update({
      where: { id: parseInt(id) },
      data: { sys_admin: Boolean(sys_admin) },
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

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user admin status:', error);
    res.status(500).json({ 
      error: 'Failed to update user admin status',
      message: error.message 
    });
  }
}
