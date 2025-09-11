/**
 * Auth Routes
 * 
 * Route definitions for authentication and audit endpoints
 */

import express from 'express';
import { getAuditLog, debugUserInfo } from '../controllers/auth.controller.js';

const router = express.Router();

// GET /api/users/:userSub/audit - Get user's audit log
router.get('/users/:userSub/audit', getAuditLog);

// GET /api/debug/userinfo/:accessToken - Debug endpoint to test userinfo from Keycloak
router.get('/debug/userinfo/:accessToken', debugUserInfo);

export default router;
