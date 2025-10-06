/**
 * Auth Routes (TypeScript version)
 * 
 * Route definitions for authentication and audit endpoints
 */

import express from 'express';
import { getAuditLog, getFullAuditLogController, debugUserInfo } from '../controllers/auth.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * @openapi
 * /api/users/{userSub}/audit:
 *   get:
 *     summary: Get user audit log
 *     description: Retrieves audit log entries for a specific user
 *     tags:
 *       - Authentication
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userSub
 *         required: true
 *         schema:
 *           type: string
 *         description: The user subject ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: User audit log
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AuditLog'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to view this user's audit log
 *       404:
 *         description: User not found
 */
router.get('/users/:userSub/audit', requireAuth, getAuditLog);

/**
 * @openapi
 * /api/admin/audit:
 *   get:
 *     summary: Get full audit log
 *     description: Retrieves the complete audit log for all users (admin only)
 *     tags:
 *       - Authentication
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of entries to return
 *     responses:
 *       200:
 *         description: Full audit log
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AuditLog'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.get('/admin/audit', requireAuth, requireAdmin, getFullAuditLogController);

/**
 * @openapi
 * /api/debug/userinfo/{accessToken}:
 *   get:
 *     summary: Debug user info (Development only)
 *     description: Debug endpoint to test userinfo retrieval from Keycloak
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: path
 *         name: accessToken
 *         required: true
 *         schema:
 *           type: string
 *         description: The access token to debug
 *     responses:
 *       200:
 *         description: User info from Keycloak
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       500:
 *         description: Error retrieving user info
 */
router.get('/debug/userinfo/:accessToken', debugUserInfo);

export default router;