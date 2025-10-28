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
import adminRoutes from './admin.routes.js';
import vocabulariesRoutes from './vocabularies.routes.js';
import rdfExportRoutes from './rdf-export.routes.js';
import hdtMetadataRoutes from './hdt-metadata.routes.js';

const router = express.Router();

// Mount route modules
router.use('/sessions', sessionRoutes);
router.use('/', authRoutes); // Auth routes include /users and /debug paths
router.use('/health', healthRoutes);
router.use('/users', usersRoutes);
router.use('/projects', projectsRoutes);
router.use('/projects', rdfExportRoutes); // RDF export: GET /api/projects/:id/export/rdf
router.use('/projects', hdtMetadataRoutes); // HDT metadata: /api/projects/:id/hdt
router.use('/admin', adminRoutes);
router.use('/vocabularies', vocabulariesRoutes);

export default router;