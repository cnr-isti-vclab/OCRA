/**
 * Users Routes (TypeScript version)
 * 
 * Route definitions for user management endpoints
 */

import express from 'express';
import { getAllUsers, getAllUsersWithStats, getUserById, updateUserAdminStatus } from '../controllers/users.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users - Get all users (admin only)
router.get('/', requireAuth, requireAdmin, getAllUsers);

// GET /api/users/stats - Get all users with project management statistics (admin only)
router.get('/stats', requireAuth, requireAdmin, getAllUsersWithStats);

// GET /api/users/:userId - Get specific user
router.get('/:userId', requireAuth, getUserById);

// PUT /api/users/:userId/admin - Update user admin status (admin only)
router.put('/:userId/admin', requireAuth, requireAdmin, updateUserAdminStatus);

export default router;