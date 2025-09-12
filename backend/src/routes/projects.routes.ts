/**
 * Projects Routes (TypeScript)
 * 
 * Route definitions for project management endpoints
 */

import express from 'express';
import { getAllProjects, getProjectById, createProject } from '../controllers/projects.controller.js';

const router = express.Router();

// GET /api/projects - Get all projects
router.get('/', getAllProjects);

// GET /api/projects/:projectId - Get specific project
router.get('/:projectId', getProjectById);

// POST /api/projects - Create new project
router.post('/', createProject);

export default router;