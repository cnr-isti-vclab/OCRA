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

/**
 * @openapi
 * /api/debug/userinfo/{accessToken}:
 *   get:
 *     summary: Debug user info (Development only)
 *     description: Debug endpoint to test userinfo retrieval from Keycloak. Returns simulated response for development.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: path
 *         name: accessToken
 *         required: true
 *         schema:
 *           type: string
 *         description: |
 *           The access token to debug. **Development token example**:
 *           
 *           ```
 *           curl -X POST http://localhost:8081/realms/demo/protocol/openid-connect/token \
 *             -H "Content-Type: application/x-www-form-urlencoded" \
 *             -d "client_id=admin-cli&grant_type=password&username=Administrator&password=admin@ocra.it" | jq -r .access_token
 *           ```
 *         example: "eyJhbGciOiJSUzI1NiIs..."
 *     responses:
 *       200:
 *         description: Simulated user info response (development only)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 userInfo:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "This is a debug endpoint"
 *                     accessToken:
 *                       type: string
 *                       example: "eyJhbGciOiJSUzI1NiIs..."
 *                     note:
 *                       type: string
 *                       example: "In a real implementation, this would validate the token with Keycloak"
 *       500:
 *         description: Error retrieving user info
 */
router.get('/admin/audit', requireAuth, requireAdmin, getFullAuditLogController);


router.get('/debug/userinfo/:accessToken', debugUserInfo);

export default router;