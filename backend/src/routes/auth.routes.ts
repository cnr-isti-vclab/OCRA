/**
 * Auth Routes (TypeScript version)
 * 
 * Route definitions for authentication and audit endpoints
 */

import express from 'express';
import { getAuditLog, getFullAuditLogController, debugUserInfo } from '../controllers/auth.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// GET /api/users/:userSub/audit - Get user's audit log
router.get('/users/:userSub/audit', requireAuth, getAuditLog);

// GET /api/admin/audit - Get full audit log for all users (admin only)
router.get('/admin/audit', requireAuth, requireAdmin, getFullAuditLogController);

// GET /api/debug/userinfo/:accessToken - Debug endpoint to test userinfo from Keycloak
router.get('/debug/userinfo/:accessToken', debugUserInfo);

export default router;