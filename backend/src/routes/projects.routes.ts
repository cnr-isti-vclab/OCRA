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
  isManagerOfProject,
  getProjectScene,
  updateProjectScene
} from '../controllers/projects.controller.js';

import { requireAuth } from '../middleware/auth.js';
import { unifiedAssetUploadMiddleware } from '../middleware/unified-asset-upload-middleware.js';
import { unifiedAssetUploadHandler } from '../controllers/unified-asset-upload.controller.js';

import {
  listProjectMembers,
  addProjectMember,
  removeProjectMember
} from '../controllers/project-members.controller.js';

const router = express.Router();

/* ============================================================================
 * PROJECT PERMISSIONS
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects/{projectId}/is-manager:
 *   get:
 *     summary: Check if current user is project manager
 *     description: Returns whether the authenticated user has manager privileges for the specified project.
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Manager status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isManager:
 *                   type: boolean
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Project not found
 */
router.get('/:projectId/is-manager', isManagerOfProject);

/* ============================================================================
 * PROJECT MEMBERS
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects/{projectId}/members:
 *   get:
 *     summary: List project members
 *     description: Returns all members of a project with their roles.
 *     tags:
 *       - Project Members
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Members list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   userId:
 *                     type: string
 *                   role:
 *                     type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Project not found
 */
router.get('/:projectId/members', listProjectMembers);

/**
 * @openapi
 * /api/projects/{projectId}/members:
 *   post:
 *     summary: Add project member
 *     description: Adds a new member to the project (manager only).
 *     tags:
 *       - Project Members
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - role
 *             properties:
 *               userId:
 *                 type: string
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member added
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: Project or user not found
 */
router.post('/:projectId/members', addProjectMember);

/**
 * @openapi
 * /api/projects/{projectId}/members/{userId}:
 *   delete:
 *     summary: Remove project member
 *     description: Removes a member from the project (manager only).
 *     tags:
 *       - Project Members
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member removed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Project or member not found
 */
router.delete('/:projectId/members/:userId', removeProjectMember);

/* ============================================================================
 * LEGACY / DEBUG SCENE FILE
 * ============================================================================
 */

/**
 * openapi
 * /api/projects/{projectId}/scene:
 *   get:
 *     summary: Get legacy scene file
 *     description: |
 *       Returns the legacy/debug scene.json file.
 *       NOTE: Production scenes are stored in MongoDB (HDT).
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Scene JSON
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 models:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: bunny
 *                       file:
 *                         type: string
 *                         description: Relative path to the model file
 *                         example: asset_1765697505792_3bp7qg8hf/bunny.ply
 *                       title:
 *                         type: string
 *                         example: bunny
 *                       visible:
 *                         type: boolean
 *                         example: true
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Scene not found
 */
//router.get('/:projectId/scene', getProjectScene);

/**
 * openapi
 * /api/projects/{projectId}/scene:
 *   put:
 *     summary: Update legacy scene file
 *     description: Updates the legacy/debug scene.json (manager only).
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Scene updated
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Project not found
 */
//router.put('/:projectId/scene', updateProjectScene);

/* ============================================================================
 * PROJECT FILES
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects/{projectId}/files:
 *   get:
 *     summary: List project assets (short format)
 *     description: Lists project digital assets from HDT with type and file URLs.
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           example: "cmj76xfa90000uenufgogf4qr"
 *     responses:
 *       200:
 *         description: Project assets list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required:
 *                       - assetId
 *                       - type
 *                       - fileUrl
 *                     properties:
 *                       assetId:
 *                         type: string
 *                         example: "asset_1765805401900_55k9zdycd"
 *                         description: Unique asset identifier
 *                       type:
 *                         type: string
 *                         enum: ["3d-model", "rti", "image", "video", "other"]
 *                         example: "3d-model"
 *                         description: Asset type from HDT schema
 *                       fileUrl:
 *                         type: string
 *                         format: uri
 *                         example: "http://localhost:3002/assets/projects/.../bunny.ply"
 *                         description: Authoritative file/manifest URL
 *                 totalAssets:
 *                   type: number
 *                   example: 2
 *                   description: Total number of assets
 *       400:
 *         description: Project ID is required
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Failed to list project assets
 */
router.get('/:projectId/files', listProjectFiles);

// FIXME da sistemare il commento e' il punto di upload dei file di un asset
/**
 * @openapi
 * /api/projects/{projectId}/files:
 *   post:
 *     summary: Upload file for an existing asset
 *     description: |
 *       Uploads a file and associates it with an existing asset.
 *       Files are stored under:
 *         project_files/{projectId}/3d-model/{assetId}/{filename}
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
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
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Project or asset not found
 */
router.post(
  '/:projectId/files', 
  requireAuth,                    // Auth middleware
  unifiedAssetUploadMiddleware,   // File processing middleware  
  unifiedAssetUploadHandler       // Upload controller
);

// FIXME Ha senso? e' usato
/**
 * openapi
 * /api/projects/{projectId}/files/{assetId}/{filename}:
 *   get:
 *     summary: Download project file
 *     description: Downloads a specific file belonging to an asset.
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
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
 *     responses:
 *       200:
 *         description: File stream
 *       401:
 *         description: Authentication required
 *       404:
 *         description: File not found
 */
//router.get('/:projectId/files/:assetId/:filename', downloadProjectFile);

/**
 * openapi
 * /api/projects/{projectId}/files/{assetId}/{filename}:
 *   delete:
 *     summary: Delete project file
 *     description: Deletes a file belonging to an asset (manager only).
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
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
 *     responses:
 *       200:
 *         description: File deleted
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized
 *       404:
 *         description: File not found
 */
//router.delete('/:projectId/files/:assetId/:filename', deleteProjectFile);

/* ============================================================================
 * PROJECT CRUD
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: Returns all projects visible to the authenticated user.
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Projects list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 projects:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Project'
 *       401:
 *         description: Authentication required
 */
router.get('/', getAllProjects);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   get:
 *     summary: Get project by ID
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 project:
 *                   $ref: '#/components/schemas/Project'
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Project not found
 */
router.get('/:projectId', getProjectById);

/**
 * @openapi
 * /api/projects:
 *   post:
 *     summary: Create new project
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               public:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Project created
 *       401:
 *         description: Authentication required
 */
router.post('/', createProject);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   put:
 *     summary: Update project
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Project updated
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Project not found
 */
router.put('/:projectId', updateProject);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   delete:
 *     summary: Delete project
 *     tags:
 *       - Projects
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project deleted
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized
 *       404:
 *         description: Project not found
 */
router.delete('/:projectId', deleteProject);

export default router;
