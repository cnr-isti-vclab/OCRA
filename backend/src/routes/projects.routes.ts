/**
 * Projects Routes (TypeScript)
 * 
 * Route definitions for project management endpoints
 */



import express from 'express';
import { getAllProjects, getProjectById, createProject, updateProject, listProjectFiles, uploadProjectFile, downloadProjectFile, upload, isManagerOfProject, getProjectScene, updateProjectScene } from '../controllers/projects.controller.js';

const router = express.Router();

// Check if current user is manager of a project
router.get('/:projectId/is-manager', isManagerOfProject);

// Get scene.json for a project
router.get('/:projectId/scene', getProjectScene);

// Update scene.json for a project (manager only)
router.put('/:projectId/scene', updateProjectScene);

// List files for a project
router.get('/:projectId/files', listProjectFiles);

// Upload a file to a project (manager only)
router.post('/:projectId/files', upload.single('file'), uploadProjectFile);

// Download a file for a project
router.get('/:projectId/files/:filename', downloadProjectFile);

// GET /api/projects - Get all projects
router.get('/', getAllProjects);

// GET /api/projects/:projectId - Get specific project
router.get('/:projectId', getProjectById);

// POST /api/projects - Create new project
router.post('/', createProject);

// PUT /api/projects/:projectId - Update project
router.put('/:projectId', updateProject);

export default router;