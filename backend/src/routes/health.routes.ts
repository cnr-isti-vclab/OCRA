/**
 * Health Routes
 * 
 * Route definitions for health check endpoints
 */

import express, { Router } from 'express';
import { healthCheck, mongoHealth } from '../controllers/health.controller.js';

const router: Router = express.Router();

// (router debug middleware removed)

// GET /health - Basic health check
router.get('/', healthCheck);

// GET /health/mongo - MongoDB specific health check
router.get('/mongo', mongoHealth);

export default router;