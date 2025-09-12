/**
 * Projects Routes (TypeScript)
 * 
 * Route definitions for project management endpoints
 */

import express from 'express';
import { getAllProjects, getProjectById, createProject, updateProject } from '../controllers/projects.controller.js';

const router = express.Router();

// GET /api/projects - Get all projects
router.get('/', getAllProjects);

// GET /api/projects/:projectId - Get specific project
router.get('/:projectId', getProjectById);

// POST /api/projects - Create new project
router.post('/', createProject);

// PUT /api/projects/:projectId - Update project
router.put('/:projectId', updateProject);

export default router;