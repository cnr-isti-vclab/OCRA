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
import {
  heartbeatPresence,
  heartbeatStructuring,
  startPresence,
  startStructuring,
  stopPresence,
  stopStructuring,
} from '../controllers/project-concurrency.controller.js';

import { requireAuth } from '../middleware/auth.js';
import { unifiedAssetUploadMiddleware } from '../middleware/unified-asset-upload-middleware.js';
import { unifiedAssetUploadHandler } from '../controllers/unified-asset-upload.controller.js';

import {
  listProjectMembers,
  addProjectMember,
  removeProjectMember
} from '../controllers/project-members.controller.js';
import { enforceStructuringLock } from '../middleware/project-structuring-lock.js';

const router = express.Router();

/* ============================================================================
 * PROJECT CRUD
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects:
 *   get:
 *     summary: List projects visible to the authenticated user
 *     description: |
 *       Returns the list of projects the current authenticated user can see.
 *       This typically includes:
 *       - projects where the user has a role (e.g., manager/member)
 *       - optionally, public projects (depending on backend rules)
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
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     description: |
 *       Creates a new project and assigns the current user as project manager.
 *       An audit event `project.create` is generated with a snapshot of the created project.
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
 *                 description: Human-readable project name
 *               description:
 *                 type: string
 *                 description: Optional project description
 *               public:
 *                 type: boolean
 *                 description: Whether the project is publicly visible
 *                 default: false
 *     responses:
 *       201:
 *         description: Project created successfully
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
 */
router.post('/', createProject);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   get:
 *     summary: Get a project by ID
 *     description: |
 *       Returns project details for the given `projectId`, if the authenticated user
 *       is allowed to access it.
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
 *         description: Project identifier
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
 *       403:
 *         description: Not authorized to access this project
 *       404:
 *         description: Project not found
 */
router.get('/:projectId', getProjectById);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   put:
 *     summary: Update an existing project
 *     description: |
 *       Updates one or more mutable fields of an existing project.
 *
 *       **Important notes:**
 *       - The project is identified **only** by `projectId` in the URL.
 *       - The request body supports **partial updates** (PATCH-like semantics).
 *       - The following fields are **forbidden** in the request body:
 *         `id`, `createdAt`, `updatedAt`.
 *       - `updatedAt` is managed automatically by the backend.
 *
 *       An audit event `project.update` is generated with the applied patch only.
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
 *         description: Project identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               name:
 *                 type: string
 *                 description: New project name
 *               description:
 *                 type: string
 *                 description: New project description
 *               public:
 *                 type: boolean
 *                 description: Public visibility flag
 *               managerId:
 *                 type: string
 *                 description: User ID of the new project manager
 *     responses:
 *       200:
 *         description: Project updated successfully
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
 *       400:
 *         description: Invalid request or forbidden fields
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only project managers can update the project
 *       404:
 *         description: Project not found
 */
router.put('/:projectId', requireAuth, updateProject);

/**
 * @openapi
 * /api/projects/{projectId}:
 *   delete:
 *     summary: Delete a project
 *     description: |
 *       Permanently deletes a project.
 *
 *       **Important notes:**
 *       - The project is identified **only** by `projectId` in the URL.
 *       - This operation is irreversible.
 *
 *       An audit event `project.delete` is generated containing:
 *       - a snapshot of the project **before deletion**
 *       - a success flag
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
 *         description: Project identifier
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only project managers can delete the project
 *       404:
 *         description: Project not found
 */
router.delete('/:projectId', requireAuth, deleteProject);

router.post('/:projectId/structuring/start', requireAuth, startStructuring);
router.post('/:projectId/structuring/heartbeat', requireAuth, heartbeatStructuring);
router.post('/:projectId/structuring/stop', requireAuth, stopStructuring);

router.post('/:projectId/presence/start', requireAuth, startPresence);
router.post('/:projectId/presence/heartbeat', requireAuth, heartbeatPresence);
router.post('/:projectId/presence/stop', requireAuth, stopPresence);

router.use('/:projectId', enforceStructuringLock);

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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       400:
 *         description: Project ID is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       400:
 *         description: Project ID is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Failed to list project members
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: Project or user not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Failed to add project member
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: Project or member not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       400:
 *         description: Project ID and User ID are required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Failed to remove project member
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.delete('/:projectId/members/:userId', removeProjectMember);

/* ============================================================================
 * PROJECT FILES / ASSETS
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
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Failed to list project assets
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/:projectId/files', listProjectFiles);

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
  requireAuth,                  // Auth middleware
  unifiedAssetUploadMiddleware, // File processing middleware
  unifiedAssetUploadHandler     // Upload controller
);

// FIXME: currently unused (commented out)
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
// router.get('/:projectId/files/:assetId/:filename', downloadProjectFile);

// FIXME: currently unused (commented out)
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
// router.delete('/:projectId/files/:assetId/:filename', deleteProjectFile);

/* ============================================================================
 * LEGACY / DEBUG SCENE FILE (NOT USED IN PRODUCTION)
 * ============================================================================
 */

// NOTE: These endpoints are intentionally disabled.
// Scenes are stored in MongoDB (HDT).

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
// router.get('/:projectId/scene', getProjectScene);

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
// router.put('/:projectId/scene', updateProjectScene);

export default router;
