import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getRecentAuditEvents } from '../controllers/admin.controller.js';
import { createUser, updateUserPrivileges, batchCreateUsers } from '../controllers/admin-users.controller.js';

const router = express.Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     AuditLog:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier of the audit event
 *           example: "aevt_01JF8QW8R4X2M4H9F7C4ZK9G3A"
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: When the event was recorded
 *           example: "2025-12-14T08:55:12.345Z"
 *         actorId:
 *           type: string
 *           description: ID of the user who performed the action
 *           example: "cmitzelrh0000uejvvncbe969"
 *         actorName:
 *           type: string
 *           description: Display name of the user who performed the action
 *           example: "Roberto Neri"
 *         action:
 *           type: string
 *           description: Type of action performed
 *           example: "PROJECT_UPDATED"
 *         entityType:
 *           type: string
 *           description: Type of entity affected by the action
 *           example: "Project"
 *         entityId:
 *           type: string
 *           description: Identifier of the affected entity
 *           example: "cmj465eyp0002ueycc7m1ucxm"
 *         entityName:
 *           type: string
 *           description: Human-readable name of the affected entity
 *           example: "TEST"
 *         details:
 *           type: object
 *           description: Optional structured details about the change
 *           additionalProperties: true
 *           example:
 *             field: "name"
 *             oldValue: "Old title"
 *             newValue: "New title"
 *         ipAddress:
 *           type: string
 *           description: IP address from which the action was performed
 *           example: "192.168.1.42"
 */


/**
 * @openapi
 * /admin/audit:
 *   get:
 *     summary: Get recent audit events
 *     description: Retrieves recent audit log events (admin only)
 *     tags:
 *       - User Administration
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of events to return
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Filter by entity type (e.g., User, Project)
 *     responses:
 *       200:
 *         description: List of audit events
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
router.get('/audit', requireAuth, requireAdmin, getRecentAuditEvents);

/**
 * @openapi
 * /admin/users:
 *   post:
 *     summary: Create new user
 *     description: Creates a new user account (admin only)
 *     tags:
 *       - User Administration
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               isAdmin:
 *                 type: boolean
 *                 default: false
 *               canCreateProjects:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid request or user already exists
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/users', requireAuth, requireAdmin, createUser);

/**
 * @openapi
 * /admin/users/batch:
 *   post:
 *     summary: Batch create users
 *     description: Creates multiple user accounts at once (admin only)
 *     tags:
 *       - User Administration
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - users
 *             properties:
 *               users:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - username
 *                     - email
 *                   properties:
 *                     username:
 *                       type: string
 *                       example: johndoe
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: john@example.com
 *                     isAdmin:
 *                       type: boolean
 *                       default: false
 *                     canCreateProjects:
 *                       type: boolean
 *                       default: true
 *     responses:
 *       201:
 *         description: Users created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 created:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       username:
 *                         type: string
 *                       error:
 *                         type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 */
router.post('/users/batch', requireAuth, requireAdmin, batchCreateUsers);

/**
 * @openapi
 * /admin/users/{userId}/privileges:
 *   put:
 *     summary: Update user privileges
 *     description: Updates user privileges including admin status and project creation ability (admin only)
 *     tags:
 *       - User Administration
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
 *             properties:
 *               isAdmin:
 *                 type: boolean
 *                 example: true
 *               canCreateProjects:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Privileges updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (admin only)
 *       404:
 *         description: User not found
 */
router.put('/users/:userId/privileges', requireAuth, requireAdmin, updateUserPrivileges);

export default router;
