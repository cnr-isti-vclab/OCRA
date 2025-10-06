/**
 * Projects Routes (TypeScript)
 * 
 * Route definitions for project management endpoints
 */



import express from 'express';
import { getAllProjects, getProjectById, createProject, updateProject, listProjectFiles, uploadProjectFile, downloadProjectFile, upload, isManagerOfProject, getProjectScene, updateProjectScene } from '../controllers/projects.controller.js';
import { listProjectMembers, addProjectMember, removeProjectMember } from '../controllers/project-members.controller.js';

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
 *         example: 507f1f77bcf86cd799439012
 *     responses:
 *       200:
 *         description: Manager status check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isManager:
 *                   type: boolean
 *                   example: true
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Project not found
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
 *         example: 507f1f77bcf86cd799439012
 *     responses:
 *       200:
 *         description: List of project members
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ProjectMember'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to view members
 *       404:
 *         description: Project not found
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
 *         example: 507f1f77bcf86cd799439012
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
 *                 description: The ID of the user to add
 *                 example: 507f1f77bcf86cd799439011
 *               role:
 *                 type: string
 *                 enum: [viewer, editor, admin]
 *                 description: The role to assign to the member
 *                 example: editor
 *     responses:
 *       200:
 *         description: Member added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectMember'
 *       400:
 *         description: Invalid request (e.g., user already a member)
 *       401:
 *         description: Not authenticated
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
 *     description: Removes a member from the project (manager only)
 *     tags:
 *       - Project Members
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
 *         example: 507f1f77bcf86cd799439012
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to remove
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Member removed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Member removed successfully
 *       400:
 *         description: Invalid request (e.g., cannot remove project owner)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: Project or member not found
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
 *         example: 507f1f77bcf86cd799439012
 *     responses:
 *       200:
 *         description: Project scene data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Scene description object (see scene_format.md)
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to view this project
 *       404:
 *         description: Project or scene file not found
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
 *         example: 507f1f77bcf86cd799439012
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Scene description object (see scene_format.md)
 *     responses:
 *       200:
 *         description: Scene updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Scene updated successfully
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: Project not found
 */
router.put('/:projectId/scene', updateProjectScene);

/**
 * @openapi
 * /api/projects/{projectId}/files:
 *   get:
 *     summary: List project files
 *     description: Returns a list of all files in the project directory
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
 *         example: 507f1f77bcf86cd799439012
 *     responses:
 *       200:
 *         description: List of project files
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: model.glb
 *                   size:
 *                     type: number
 *                     example: 1024000
 *                   modifiedAt:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to view this project
 *       404:
 *         description: Project not found
 */
router.get('/:projectId/files', listProjectFiles);

/**
 * @openapi
 * /api/projects/{projectId}/files:
 *   post:
 *     summary: Upload project file
 *     description: Uploads a new file to the project directory and updates scene.json (manager only)
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
 *         example: 507f1f77bcf86cd799439012
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload (GLB, PLY, or other 3D model formats)
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: File uploaded successfully
 *                 filename:
 *                   type: string
 *                   example: model.glb
 *       400:
 *         description: Invalid request (e.g., no file provided)
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
 * /api/projects/{projectId}/files/{filename}:
 *   get:
 *     summary: Download project file
 *     description: Downloads a specific file from the project directory
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
 *         example: 507f1f77bcf86cd799439012
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *         description: The filename to download
 *         example: model.glb
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to access this project
 *       404:
 *         description: Project or file not found
 */
router.get('/:projectId/files/:filename', downloadProjectFile);

/**
 * @openapi
 * /api/projects:
 *   get:
 *     summary: Get all projects
 *     description: Returns a list of all projects visible to the authenticated user
 *     tags:
 *       - Projects
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of projects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Project'
 *       401:
 *         description: Not authenticated
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
 *         example: 507f1f77bcf86cd799439012
 *     responses:
 *       200:
 *         description: Project details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized to view this project
 *       404:
 *         description: Project not found
 */
router.get('/:projectId', getProjectById);

/**
 * @openapi
 * /api/projects:
 *   post:
 *     summary: Create new project
 *     description: Creates a new project (requires createProjects privilege)
 *     tags:
 *       - Projects
 *     security:
 *       - sessionAuth: []
 *       - bearerAuth: []
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
 *                 example: My New Project
 *               description:
 *                 type: string
 *                 example: A collaborative 3D modeling project
 *     responses:
 *       201:
 *         description: Project created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (createProjects privilege required)
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
 *         example: 507f1f77bcf86cd799439012
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Updated Project Name
 *               description:
 *                 type: string
 *                 example: Updated project description
 *     responses:
 *       200:
 *         description: Project updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Project'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: Project not found
 */
router.put('/:projectId', updateProject);

export default router;