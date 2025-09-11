/**
 * Session Routes (TypeScript version)
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

// POST /api/sessions - Create a new session
router.post('/', createUserSession);

// GET /api/sessions/:sessionId - Get session details
router.get('/:sessionId', getUserSession);

// DELETE /api/sessions/:sessionId - Delete a session
router.delete('/:sessionId', deleteUserSession);

export default router;