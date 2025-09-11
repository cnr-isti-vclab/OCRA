/**
 * Users Routes (TypeScript version)
 * 
 * Route definitions for user management endpoints
 */

import express from 'express';
import { getAllUsers, getUserById, updateUserAdminStatus } from '../controllers/users.controller.js';

const router = express.Router();

// GET /api/users - Get all users
router.get('/', getAllUsers);

// GET /api/users/:userId - Get specific user
router.get('/:userId', getUserById);

// PUT /api/users/:userId/admin - Update user admin status
router.put('/:userId/admin', updateUserAdminStatus);

export default router;