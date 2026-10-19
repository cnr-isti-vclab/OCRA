/**
 * Auth Routes (TypeScript version)
 * 
 * Route definitions for authentication and audit endpoints
 */

import express from 'express';
import { getAuditLog, getFullAuditLogController } from '../controllers/auth.controller.js';
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
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: userSub
 *         required: true
 *         schema:
 *           type: string
 *         description: The user subject ID
 *         example: b4b55cc9-fc63-4d8f-9993-4fac36cedcaa
 *     responses:
 *       200:
 *         description: User audit log response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserAuditLogResponse'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to view this user's audit log
 *       404:
 *         description: User not found
 */
router.get('/users/:userSub/audit', requireAuth, getAuditLog);

router.get('/admin/audit', requireAuth, requireAdmin, getFullAuditLogController);

export default router;
