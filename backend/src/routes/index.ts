/**
 * Route Index (TypeScript version)
 * 
 * Central route configuration
 */

import express from 'express';
import sessionRoutes from './session.routes.js';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import usersRoutes from './users.routes.js';
import projectsRoutes from './projects.routes.js';

const router = express.Router();

// Mount route modules
router.use('/sessions', sessionRoutes);
router.use('/', authRoutes); // Auth routes include /users and /debug paths
router.use('/health', healthRoutes);
router.use('/users', usersRoutes);
router.use('/projects', projectsRoutes);

export default router;