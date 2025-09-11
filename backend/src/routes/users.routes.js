import express from 'express';
import { getAllUsers, getUserById, updateUserAdminStatus } from '../controllers/users.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * USER ROUTES
 * 
 * All user-related API endpoints.
 * All routes require authentication, some require admin privileges.
 */

// GET /api/users - Get all users (admin only)
router.get('/', requireAuth, requireAdmin, getAllUsers);

// GET /api/users/:id - Get specific user by ID
router.get('/:id', requireAuth, getUserById);

// PUT /api/users/:id/admin - Update user admin status (admin only)
router.put('/:id/admin', requireAuth, requireAdmin, updateUserAdminStatus);

export default router;
