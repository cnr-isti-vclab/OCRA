/**
 * Session Routes (TypeScript version)
 * 
 * Route definitions for session management endpoints
 */

import express from 'express';
import { 
  createUserSession, 
  getUserSession, 
  deleteUserSession,
  getCurrentUser
} from '../controllers/session.controller.js';

const router = express.Router();

/**
 * @openapi
 * /api/sessions:
 *   post:
 *     summary: Create OAuth user session
 *     description: Creates a new session from OAuth provider response (Keycloak). Sets HTTP-only session cookie.
 *     tags:
 *       - Session
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSessionRequest'
 *     responses:
 *       200:
 *         description: Session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                   example: "cmj71n1p50001uej9dykw6j77"
 *               headers:
 *                 Set-Cookie:
 *                   type: string
 *                   example: "session_id=cmj71n1p50001uej9dykw6j77; HttpOnly; Max-Age=86400000"
 *       500:
 *         description: Failed to create session
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to create session"
 *                 message:
 *                   type: string
 */
router.post('/', createUserSession);

/**
 * @openapi
 * /api/sessions/current:
 *   get:
 *     summary: Get current user information
 *     description: Returns information about the currently authenticated user
 *     tags:
 *       - Session
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: cmitzelrh0000uejvvncbe969
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: director@example.com
 *                     name:
 *                       type: string
 *                       example: Roberto Neri
 *                     username:
 *                       type: string
 *                       example: museum-director
 *                     displayName:
 *                       type: string
 *                       example: Roberto Neri
 *                     sys_admin:
 *                       type: boolean
 *                       example: false
 *                     sys_creator:
 *                       type: boolean
 *                       example: true
 *                     managedProjects:
 *                       type: array
 *                       items:
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

router.get('/current', getCurrentUser);

/**
 * @openapi
 * /api/sessions/{sessionId}:
 *   get:
 *     summary: Get session details
 *     description: Retrieves details for a specific session by ID
 *     tags:
 *       - Session
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The session ID
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Session details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     sub:
 *                       type: string
 *                       example: 2c3becb0-d244-41dc-b776-6a2dee80193b
 *                     name:
 *                       type: string
 *                       example: Roberto Neri
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: director@example.com
 *                     username:
 *                       type: string
 *                       example: museum-director
 *                     given_name:
 *                       type: string
 *                       example: Roberto
 *                     family_name:
 *                       type: string
 *                       example: Neri
 *                     middle_name:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     sys_admin:
 *                       type: boolean
 *                       example: false
 *                     sys_creator:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:sessionId', getUserSession);

/**
 * @openapi
 * /api/sessions/{sessionId}:
 *   delete:
 *     summary: Delete user session (logout)
 *     description: Invalidates a session, logs logout event with audit trail, and returns success confirmation.
 *     tags:
 *       - Session
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Session ID to delete
 *         example: "cmj71n1p50001uej9dykw6j77"
 *     responses:
 *       200:
 *         description: Session deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Session deleted successfully"
 *       400:
 *         description: Session ID required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Session ID required"
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Session not found"
 *       401:
 *         description: Not authenticated
 */
router.delete('/:sessionId', deleteUserSession);

export default router;