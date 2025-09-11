/**
 * Route Index
 * 
 * Central route configuration
 */

import express from 'express';
import sessionRoutes from './session.routes.js';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';

const router = express.Router();

// Mount route modules
router.use('/sessions', sessionRoutes);
router.use('/', authRoutes); // Auth routes include /users and /debug paths
router.use('/health', healthRoutes);

export default router;
