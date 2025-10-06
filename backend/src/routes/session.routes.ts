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
 *     summary: Create a new user session
 *     description: Creates a new session for a user with the provided credentials
 *     tags:
 *       - Session
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
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
 *                   example: 507f1f77bcf86cd799439011
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *               $ref: '#/components/schemas/User'
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
 *                 sessionId:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 createdAt:
 *                   type: string
 *                   format: date-time
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
 *     summary: Delete a session
 *     description: Logs out the user by deleting their session
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
 *         description: The session ID to delete
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Session deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Session deleted successfully
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:sessionId', deleteUserSession);

export default router;