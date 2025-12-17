/**
 * Users Routes (TypeScript version)
 *
 * Route definitions for user management endpoints
 */

import express from 'express';
import {
  getAllUsers,
  getAllUsersWithStats,
  getUserById,
  updateUserAdminStatus,
  getUsersForDropdown,
  debugProjectRoles
} from '../controllers/users.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/* ============================================================================
 * USERS COLLECTION
 * ============================================================================
 */

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

/* ============================================================================
 * USERS LISTS / STATS / DEBUG (STATIC ROUTES)
 * ============================================================================
 */

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
 *                     example: cmitzelrh0000uejvvncbe969
 *                   email:
 *                     type: string
 *                     format: email
 *                     example: director@example.com
 *                   name:
 *                     type: string
 *                     description: Full display name
 *                     example: Roberto Neri
 *                   username:
 *                     type: string
 *                     example: museum-director
 *                   given_name:
 *                     type: string
 *                     example: Roberto
 *                   family_name:
 *                     type: string
 *                     example: Neri
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
 *                 $ref: '#/components/schemas/UserWithStats'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/stats', requireAuth, requireAdmin, getAllUsersWithStats);

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
 *               properties:
 *                 totalManagerRoles:
 *                   type: integer
 *                   example: 1
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: cmj465jvf0006ueycughkxlg6
 *                       userId:
 *                         type: string
 *                         example: cmitzelrh0000uejvvncbe969
 *                       projectId:
 *                         type: string
 *                         example: cmj465eyp0002ueycc7m1ucxm
 *                       role:
 *                         type: string
 *                         example: manager
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-13T10:44:35.931Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-13T10:44:35.931Z"
 *                       user:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: cmitzelrh0000uejvvncbe969
 *                           email:
 *                             type: string
 *                             format: email
 *                             example: director@example.com
 *                           name:
 *                             type: string
 *                             example: Roberto Neri
 *                           username:
 *                             type: string
 *                             example: museum-director
 *                       project:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: cmj465eyp0002ueycc7m1ucxm
 *                           name:
 *                             type: string
 *                             example: TEST
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/debug/roles', requireAuth, requireAdmin, debugProjectRoles);

/* ============================================================================
 * USER BY ID
 * ============================================================================
 */

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
 *         example: cmitzelrh0000uejvvncbe969
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
 *     description: Updates the sys_admin privileges for a user (admin only)
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
 *         example: "507f1f77bcf86cd799439011"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sys_admin
 *             properties:
 *               sys_admin:
 *                 type: boolean
 *                 description: System admin status (true/false)
 *                 example: true
 *     responses:
 *       200:
 *         description: User admin status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request (missing userId or invalid sys_admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (requires admin privileges)
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:userId/admin', requireAuth, requireAdmin, updateUserAdminStatus);

export default router;
