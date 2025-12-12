/**
 * Projects Routes (TypeScript)
 * 
 * Route definitions for project management endpoints
 */

import express from 'express';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  listProjectFiles,
  uploadProjectFile,
  downloadProjectFile,
  deleteProjectFile,
  upload,
  isManagerOfProject,
  getProjectScene,
  updateProjectScene
} from '../controllers/projects.controller.js';

import {
  listProjectMembers,
  addProjectMember,
  removeProjectMember
} from '../controllers/project-members.controller.js';

const router = express.Router();

/**
 * @openapi
 * /api/projects/{projectId}/is-manager:
 *   get:
 *     summary: Check if current user is project manager
 *     description: Returns whether the authenticated user has manager privileges for the specified project
 *     tags:
 *       - Projects
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
 */
router.get('/:projectId/is-manager', isManagerOfProject);

/**
 * @openapi
 * /api/projects/{projectId}/members:
 *   get:
 *     summary: List project members
 *     description: Returns a list of all members for the specified project with their roles
 *     tags:
 *       - Project Members
 */
router.get('/:projectId/members', listProjectMembers);

/**
 * @openapi
 * /api/projects/{projectId}/members:
 *   post:
 *     summary: Add project member
 *     description: Adds a new member to the project with the specified role (manager only)
 *     tags:
 *       - Project Members
 */
router.post('/:projectId/members', addProjectMember);

/**
 * @openapi
 * /api/projects/{projectId}/members/{userId}:
 *   delete:
 *     summary: Remove project member
 *     description: Removes a member from the project (manager only)
 *     tags:
 *       - Project Members
 */
router.delete('/:projectId/members/:userId', removeProjectMember);

/**
 * @openapi
 * /api/projects/{projectId}/scene:
 *   get:
 *     summary: Get project scene
 *     description: Retrieves the scene.json file for the specified project
 *     tags:
 *       - Projects
 */
router.get('/:projectId/scene', getProjectScene);

/**
 * @openapi
 * /api/projects/{projectId}/scene:
 *   put:
 *     summary: Update project scene
 *     description: Updates the scene.json file for the specified project (manager only)
 *     tags:
 *       - Projects
 */
router.put('/:projectId/scene', updateProjectScene);

/**
 * @openapi
 * /api/projects/{projectId}/files:
 *   get:
 *     summary: List project files
 *     description: Returns a list of all 3D files grouped by asset
 *     tags:
 *       - Projects
 */
router.get('/:projectId/files', listProjectFiles);

/**
 * @openapi
 * /api/projects/{projectId}/files:
 *   post:
 *     summary: Upload 3D file for an existing asset
 *     description: |
 *       Uploads a 3D model file and associates it with an existing asset.
 *       
 *       The asset **must already exist** and its `assetId` is typically obtained
 *       by calling:
 *       
 *         POST /api/projects/{projectId}/hdt
 *       
 *       The uploaded file will be stored under:
 *       
 *         project_files/{projectId}/model3d/{assetId}/{filename}
 *       
 *       and the project `scene.json` will be updated accordingly.
 *     tags:
 *       - Projects
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - assetId
 *               - file
 *             properties:
 *               assetId:
 *                 type: string
 *                 description: |
 *                   The unique asset identifier.
 *                   This ID is assigned by the HDT service when the asset
 *                   metadata is created.
 *                 example: 6f3a9c12-1c2b-4f99-9fcb-8a2e9e4c1234
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: |
 *                   The 3D model file to upload (e.g. GLB, GLTF, PLY, OBJ).
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 projectId:
 *                   type: string
 *                 assetId:
 *                   type: string
 *                 file:
 *                   type: string
 *                   example: model.glb
 *       400:
 *         description: Invalid request (missing assetId or file)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: Project not found
 */
router.post('/:projectId/files', upload.single('file'), uploadProjectFile);


/**
 * @openapi
 * /api/projects/{projectId}/files/{assetId}/{filename}:
 *   get:
 *     summary: Download project file (by asset)
 *     description: |
 *       Downloads a specific file belonging to a specific 3D asset.
 *       Files are stored under:
 *       project_files/{projectId}/model3d/{assetId}/{filename}
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: The HDT asset ID
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/:projectId/files/:assetId/:filename', downloadProjectFile);

/**
 * @openapi
 * /api/projects/{projectId}/files/{assetId}/{filename}:
 *   delete:
 *     summary: Delete project file (by asset)
 *     description: |
 *       Deletes a specific file belonging to a specific 3D asset.
 *       Only accessible by project managers.
 *     tags:
 *       - Projects
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 */
router.delete('/:projectId/files/:assetId/:filename', deleteProjectFile);

/**
 * LEGACY ROUTES (optional)
 * Keep only if backward compatibility is required.
 * IMPORTANT: must stay AFTER the assetId routes.
 */
// router.get('/:projectId/files/:filename', downloadProjectFile);
// router.delete('/:projectId/files/:filename', deleteProjectFile);

/**
 * @openapi
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: Returns a list of all projects visible to the authenticated user
 *     tags:
 *       - Projects
 */
router.get('/', getAllProjects);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   get:
 *     summary: Get project by ID
 *     description: Retrieves details for a specific project
 *     tags:
 *       - Projects
 */
router.get('/:projectId', getProjectById);

/**
 * @openapi
 * /api/projects:
 *   post:
 *     summary: Create new project
 *     description: Creates a new project
 *     tags:
 *       - Projects
 */
router.post('/', createProject);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   put:
 *     summary: Update project
 *     description: Updates project details (manager only)
 *     tags:
 *       - Projects
 */
router.put('/:projectId', updateProject);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   delete:
 *     summary: Delete a project
 *     description: Deletes a project and all associated data (manager only)
 *     tags:
 *       - Projects
 */
router.delete('/:projectId', deleteProject);

export default router;
