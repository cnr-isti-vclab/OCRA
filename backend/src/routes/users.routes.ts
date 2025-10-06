/**
 * Users Routes (TypeScript version)
 * 
 * Route definitions for user management endpoints
 */

import express from 'express';
import { getAllUsers, getAllUsersWithStats, getUserById, updateUserAdminStatus, getUsersForDropdown, debugProjectRoles } from '../controllers/users.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Get all users
 *     description: Retrieves a list of all users (admin only)
 *     tags:
 *       - Users
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', requireAuth, requireAdmin, getAllUsers);

/**
 * @openapi
 * /api/users/list:
 *   get:
 *     summary: Get user list for dropdowns
 *     description: Retrieves a simplified list of users suitable for dropdown menus (authenticated users only)
 *     tags:
 *       - Users
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Simplified user list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   username:
 *                     type: string
 *                   email:
 *                     type: string
 *       401:
 *         description: Not authenticated
 */
router.get('/list', requireAuth, getUsersForDropdown);

/**
 * @openapi
 * /api/users/stats:
 *   get:
 *     summary: Get users with statistics
 *     description: Retrieves all users with project management statistics (admin only)
 *     tags:
 *       - Users
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users with statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/User'
 *                   - type: object
 *                     properties:
 *                       projectCount:
 *                         type: number
 *                         example: 5
 *                       memberCount:
 *                         type: number
 *                         example: 3
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/stats', requireAuth, requireAdmin, getAllUsersWithStats);

/**
 * @openapi
 * /api/users/{userId}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieves details for a specific user
 *     tags:
 *       - Users
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:userId', requireAuth, getUserById);

/**
 * @openapi
 * /api/users/{userId}/admin:
 *   put:
 *     summary: Update user admin status
 *     description: Updates the admin privileges for a user (admin only)
 *     tags:
 *       - Users
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *         example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isAdmin
 *             properties:
 *               isAdmin:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: User admin status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:userId/admin', requireAuth, requireAdmin, updateUserAdminStatus);

/**
 * @openapi
 * /api/users/debug/roles:
 *   get:
 *     summary: Debug project role assignments
 *     description: Returns debugging information about project role assignments (admin only)
 *     tags:
 *       - Users
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Project role debug information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/debug/roles', requireAuth, requireAdmin, debugProjectRoles);

export default router;