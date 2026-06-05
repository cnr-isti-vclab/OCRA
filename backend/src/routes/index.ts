/**
 * Route Index (TypeScript version)
 * 
 * Central route configuration
 */

import express from 'express';
import sessionRoutes from './session.routes.js';
import authRoutes from './auth.routes.js';
import oauthRoutes from './oauth.routes.js';
import healthRoutes from './health.routes.js';
import usersRoutes from './users.routes.js';
import projectsRoutes from './projects.routes.js';
import adminRoutes from './admin.routes.js';
import vocabulariesRoutes from './vocabularies.routes.js';
import hdtMetadataRoutes from './hdt-metadata.routes.js';
import annotationRoutes from './annotation.routes.js';

const router = express.Router();

// Log route mounting
console.log('📋 [Routes] Mounting API routes...');

// Mount route modules
router.use('/oauth', oauthRoutes); // OAuth token exchange (must be public, no auth required)
console.log('✅ [Routes] Mounted: /oauth');

router.use('/sessions', sessionRoutes);
console.log('✅ [Routes] Mounted: /sessions');
router.use('/', authRoutes); // Auth routes include /users and /debug paths
router.use('/health', healthRoutes);
router.use('/users', usersRoutes);
router.use('/projects', projectsRoutes);
router.use('/projects', hdtMetadataRoutes); // HDT metadata: /api/projects/:id/hdt
router.use('/projects', annotationRoutes); // Annotations: /api/projects/:id/annotations
router.use('/', hdtMetadataRoutes); // SPARQL proxy: /api/sparql-proxy
router.use('/admin', adminRoutes);
router.use('/vocabularies', vocabulariesRoutes);

export default router;