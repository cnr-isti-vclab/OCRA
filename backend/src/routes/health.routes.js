/**
 * Health Routes
 * 
 * Route definitions for health check endpoints
 */

import express from 'express';
import { healthCheck } from '../controllers/health.controller.js';

const router = express.Router();

// GET /health - Basic health check
router.get('/', healthCheck);

export default router;
