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
import { readinessCheck } from '../controllers/health.controller.js';
import usersRoutes from './users.routes.js';
import projectsRoutes from './projects.routes.js';
import adminRoutes from './admin.routes.js';
import vocabulariesRoutes from './vocabularies.routes.js';
import hdtMetadataRoutes from './hdt-metadata.routes.js';
import annotationRoutes from './annotation.routes.js';
import echoesRoutes from './echoes.routes.js';
import arcoRoutes from './arco.routes.js';
import wikidataRoutes from './wikidata.routes.js';
import europeanaRoutes from './europeana.routes.js';
// @spike feature/vocabulary-color-spike — remove when vocabulary data is in DB (see frontend/src/routes/components/TtlVocabularyWidget.tsx)
import vocabularyConceptsRoutes from './vocabulary-concepts.routes.js';

const router = express.Router();

// Mount route modules
router.use('/oauth', oauthRoutes); // OAuth token exchange (must be public, no auth required)
router.use('/sessions', sessionRoutes);
router.use('/', authRoutes); // Auth routes include /users and /debug paths
router.use('/health', healthRoutes);
router.get('/ready', readinessCheck);
router.use('/users', usersRoutes);
router.use('/projects', projectsRoutes);
router.use('/projects', hdtMetadataRoutes); // HDT metadata: /api/projects/:id/hdt
router.use('/projects', annotationRoutes); // Annotations: /api/projects/:id/annotations
router.use('/', hdtMetadataRoutes); // SPARQL proxy: /api/sparql-proxy
router.use('/eccch', echoesRoutes);
router.use('/arco', arcoRoutes);
router.use('/wikidata', wikidataRoutes);
router.use('/europeana', europeanaRoutes);
router.use('/admin', adminRoutes);
router.use('/vocabularies', vocabulariesRoutes);
// @spike feature/vocabulary-color-spike — remove when vocabulary data is in DB (see frontend/src/routes/components/TtlVocabularyWidget.tsx)
router.use('/vocabulary', vocabularyConceptsRoutes);

export default router;
