/**
 * Session Routes
 * 
 * Route definitions for session management endpoints
 */

import express from 'express';
import { 
  createUserSession, 
  getUserSession, 
  deleteUserSession 
} from '../controllers/session.controller.js';

const router = express.Router();

// POST /api/sessions - Create user session after OAuth token exchange
router.post('/', createUserSession);

// GET /api/sessions/:sessionId - Get session info (validate and return user data)
router.get('/:sessionId', getUserSession);

// DELETE /api/sessions/:sessionId - Delete session (logout)
router.delete('/:sessionId', deleteUserSession);

export default router;
