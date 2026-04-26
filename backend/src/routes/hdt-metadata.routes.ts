/**
 * HDT Metadata Routes
 *
 * API endpoints for managing Heritage Digital Twin (HDT) documents in MongoDB.
 * Handles metadata (Dublin Core, CIDOC-CRM), digital assets, scenes, and scene-asset associations.
 *
 * Base path: `/api/projects`
 *
 * Key routes:
 * - HDT: GET/POST/PUT/DELETE `/projects/:projectId/hdt`
 * - Assets: POST `/projects/:projectId/hdt/assets`, PUT/DELETE `/projects/:projectId/hdt/assets/:assetId`
 * - Scenes: GET `/projects/:projectId/scenes`, GET `/projects/:projectId/scenes/:sceneId`
 * - Scene management: POST/PUT/DELETE `/projects/:projectId/hdt/scenes[/:sceneId]`
 * - Scene assets: POST/PUT/DELETE `/projects/:projectId/hdt/scenes/:sceneId/assets[/:assetId]`
 * - Exports: GET `/projects/:projectId/export/rdf`, POST `/sparql-proxy`
 */

import { Router } from 'express';
import {
  getHDTMetadataHandler,
  createHDTMetadataHandler,
  updateHDTMetadataHandler,
  importPhysicalObjectMetadataHandler,
  deleteHDTMetadataHandler,
  addAssetHandler,
  updateAssetHandler,
  removeAssetHandler,
  listScenesHandler,
  createSceneHandler,
  updateSceneHandler,
  deleteSceneHandler,
  addAssetToSceneHandler,
  updateAssetInSceneHandler,
  removeAssetFromSceneHandler,
  getSceneFileHandler,
  exportSceneFileHandler
} from '../controllers/hdt-metadata.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { enforceStructuringLock } from '../middleware/project-structuring-lock.js';
import { getHDTDocument } from '../services/hdt-metadata.service.js';

const router = Router();

router.use('/:projectId', enforceStructuringLock);

/* ============================================================================
 * DIGITAL ASSETS (in HDT document) + RTI upload
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects/{projectId}/hdt/assets:
 *   post:
 *     summary: Add a digital asset
 *     description: Adds a digital asset to the project's HDT document (manager only).
 *     tags:
 *       - HDT Assets
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *     responses:
 *       200:
 *         description: HDT document
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: HDT document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/:projectId/hdt', requireAuth, getHDTMetadataHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt:
 *   post:
 *     summary: Create HDT document
 *     description: Creates/initializes the HDT document for a project (manager only).
 *     tags:
 *       - HDT
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               physicalObjectMetadata:
 *                 type: object
 *                 properties:
 *                   sourceUri:
 *                     type: string
 *                   sourceType:
 *                     type: string
 *                     enum: [echoes, wikidata, arco, other]
 *                   dublinCore:
 *                     type: object
 *                   cidocCrm:
 *                     type: object
 *     responses:
 *       201:
 *         description: HDT document created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
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
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       409:
 *         description: HDT document already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       400:
 *         description: Invalid physical object metadata payload or missing project id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post('/:projectId/hdt', requireAuth, createHDTMetadataHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt:
 *   put:
 *     summary: Update HDT metadata
 *     description: Updates HDT metadata fields for a project (manager only).
 *     tags:
 *       - HDT
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               physicalObjectMetadata:
 *                 type: object
 *                 properties:
 *                   sourceUri:
 *                     type: string
 *                   sourceType:
 *                     type: string
 *                     enum: [echoes, wikidata, arco, other]
 *                   dublinCore:
 *                     type: object
 *                   cidocCrm:
 *                     type: object
 *     responses:
 *       200:
 *         description: HDT document updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
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
 *         description: HDT document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       400:
 *         description: Invalid physical object metadata payload, missing project id, or empty metadata update
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.put('/:projectId/hdt', requireAuth, updateHDTMetadataHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/physical-object/import:
 *   post:
 *     summary: Import physical object metadata
 *     description: Imports physical object metadata from a source adapter (manager only).
 *     tags:
 *       - HDT
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceType
 *               - sourceUri
 *             properties:
 *               sourceType:
 *                 type: string
 *                 enum: [echoes, wikidata, arco, other]
 *               sourceUri:
 *                 type: string
 *               payload:
 *                 type: object
 *                 description: Source-specific request payload.
 *     responses:
 *       200:
 *         description: HDT document updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       201:
 *         description: HDT document created and metadata imported
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       400:
 *         description: Invalid request payload
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
 *         description: Project or HDT document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       501:
 *         description: Source adapter not implemented
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post('/:projectId/hdt/physical-object/import', requireAuth, importPhysicalObjectMetadataHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt:
 *   delete:
 *     summary: Delete HDT document
 *     description: Deletes the HDT document for a project (manager only).
 *     tags:
 *       - HDT
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *     responses:
 *       200:
 *         description: HDT document deleted
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
 *         description: HDT document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       400:
 *         description: Missing project id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.delete('/:projectId/hdt', requireAuth, deleteHDTMetadataHandler);

/* ============================================================================
 * DIGITAL ASSETS (in HDT document) + RTI upload
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects/{projectId}/hdt/assets:
 *   post:
 *     summary: Add a digital asset
 *     description: Adds a digital asset to the project's HDT document (manager only).
 *     tags:
 *       - HDT Assets
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DigitalAssetCreate'
 *     responses:
 *       201:
 *         description: HDT document updated (asset added)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Only project managers can add assets
 *               code: hdt.asset_manager_required
 *               status: 403
 *       404:
 *         description: HDT document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: HDT document not found
 *               code: hdt.asset_document_not_found
 *               status: 404
 *       400:
 *         description: Invalid asset payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Asset "type" is required
 *               code: hdt.asset_invalid_type
 *               status: 400
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to add asset
 *               code: hdt.asset_create_failed
 *               status: 500
 */
router.post('/:projectId/hdt/assets', requireAuth, addAssetHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/assets/{assetId}:
 *   put:
 *     summary: Update a digital asset
 *     description: Updates a digital asset in the HDT document (manager only).
 *     tags:
 *       - HDT Assets
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DigitalAssetUpdate'
 *     responses:
 *       200:
 *         description: HDT document updated (asset updated)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Only project managers can update assets
 *               code: hdt.asset_manager_required
 *               status: 403
 *       404:
 *         description: HDT document or asset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: HDT document or asset not found
 *               code: hdt.asset_or_document_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to update asset
 *               code: hdt.asset_update_failed
 *               status: 500
 */
router.put('/:projectId/hdt/assets/:assetId', requireAuth, updateAssetHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/assets/{assetId}:
 *   delete:
 *     summary: Remove a digital asset
 *     description: |
 *       Removes a digital asset from the HDT document and from all scenes. For RTI assets, this also removes files on disk.
 *
 *       **Important notes:**
 *       - Only project managers can remove assets.
 *       - The authenticated session must own an active **exclusive structuring lock** for the same project.
 *       - If no lock exists the endpoint returns `409`; if the active lock belongs to another session it returns `423`.
 *     tags:
 *       - HDT Assets
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID.
 *     responses:
 *       200:
 *         description: HDT document updated (asset removed)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Only project managers can remove assets
 *               code: hdt.asset_manager_required
 *               status: 403
 *       409:
 *         description: No active exclusive structuring lock exists for the project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Active exclusive structuring lock required
 *               code: structuring.lock_missing
 *               status: 409
 *       423:
 *         description: The caller does not own the active exclusive structuring lock
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Active exclusive structuring lock owned by the caller is required
 *               code: structuring.owner_required
 *               status: 423
 *       404:
 *         description: HDT document or asset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Asset not found in HDT document
 *               code: hdt.asset_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to remove asset
 *               code: hdt.asset_delete_failed
 *               status: 500
 */
router.delete('/:projectId/hdt/assets/:assetId', requireAuth, removeAssetHandler);

/* ============================================================================
 * SCENES (stored in MongoDB, served as JSON for ThreePresenter)
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects/{projectId}/scenes:
 *   get:
 *     summary: List scenes
 *     description: Lists available scenes for a project (viewer helper endpoint).
 *     tags:
 *       - Scenes
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *     responses:
 *       200:
 *         description: Scene list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   fileName:
 *                     type: string
 *                   isDefault:
 *                     type: boolean
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to list scenes
 *               code: hdt.list_scenes_failed
 *               status: 500
 */
router.get('/:projectId/scenes', requireAuth, listScenesHandler);

/**
 * @openapi
 * /api/projects/{projectId}/scenes/{sceneId}:
 *   get:
 *     summary: Get scene description JSON
 *     description: Returns a SceneDescription JSON generated from MongoDB (used by ThreePresenter).
 *     tags:
 *       - Scenes
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *       - in: path
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *         description: Scene ID (e.g. "default").
 *     responses:
 *       200:
 *         description: SceneDescription JSON
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SceneDescription'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       404:
 *         description: Scene not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Scene not found in database
 *               code: hdt.scene_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to serve scene file
 *               code: hdt.scene_modify_failed
 *               status: 500
 */
router.get('/:projectId/scenes/:sceneId', requireAuth, getSceneFileHandler);

/**
 * @openapi
 * /api/projects/{projectId}/scenes/{sceneId}/export:
 *   get:
 *     summary: Export scene description JSON to disk
 *     description: Generates the SceneDescription JSON from MongoDB and returns it. This is intended for debugging (auth required).
 *     tags:
 *       - Scenes
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *       - in: path
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *         description: Scene ID.
 *     responses:
 *       200:
 *         description: SceneDescription JSON
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SceneDescription'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       404:
 *         description: Scene not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Scene not found
 *               code: hdt.scene_not_found
 *               status: 404
 *       400:
 *         description: Missing project or scene id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Project ID and Scene ID are required
 *               code: hdt.project_and_scene_id_required
 *               status: 400
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to export scene
 *               code: hdt.scene_modify_failed
 *               status: 500
 */
router.get('/:projectId/scenes/:sceneId/export', requireAuth, exportSceneFileHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/scenes:
 *   post:
 *     summary: Create a scene
 *     description: Creates a new scene in the project's HDT document (manager only).
 *     tags:
 *       - Scenes
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/HDTSceneCreate'
 *     responses:
 *       201:
 *         description: HDT document updated (scene created)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Only project managers or editors can create scenes
 *               code: hdt.scene_editor_or_manager_required
 *               status: 403
 *       404:
 *         description: HDT document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: HDT document not found
 *               code: hdt.scene_document_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to create scene
 *               code: hdt.scene_create_failed
 *               status: 500
 */
router.post('/:projectId/hdt/scenes', requireAuth, createSceneHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/scenes/{sceneId}:
 *   put:
 *     summary: Update a scene
 *     description: Updates a scene in the project's HDT document (manager only).
 *     tags:
 *       - Scenes
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *       - in: path
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *         description: Scene ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/HDTSceneUpdate'
 *     responses:
 *       200:
 *         description: HDT document updated (scene updated)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Only project managers or editors can update scenes
 *               code: hdt.scene_editor_or_manager_required
 *               status: 403
 *       404:
 *         description: HDT document or scene not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: HDT document or scene not found
 *               code: hdt.scene_or_document_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to update scene
 *               code: hdt.scene_update_failed
 *               status: 500
 */
router.put('/:projectId/hdt/scenes/:sceneId', requireAuth, updateSceneHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/scenes/{sceneId}:
 *   delete:
 *     summary: Delete a scene
 *     description: |
 *       Deletes a scene from the project's HDT document.
 *
 *       **Important notes:**
 *       - Only project managers or editors can delete scenes.
 *       - The authenticated session must own an active **exclusive structuring lock** for the same project.
 *       - If no lock exists the endpoint returns `409`; if the active lock belongs to another session it returns `423`.
 *     tags:
 *       - Scenes
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *       - in: path
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *         description: Scene ID.
 *     responses:
 *       200:
 *         description: HDT document updated (scene removed)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Only project managers or editors can delete scenes
 *               code: hdt.scene_editor_or_manager_required
 *               status: 403
 *       409:
 *         description: No active exclusive structuring lock exists for the project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Active exclusive structuring lock required
 *               code: structuring.lock_missing
 *               status: 409
 *       423:
 *         description: The caller does not own the active exclusive structuring lock
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Active exclusive structuring lock owned by the caller is required
 *               code: structuring.owner_required
 *               status: 423
 *       404:
 *         description: HDT document or scene not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: HDT document not found
 *               code: hdt.scene_document_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to delete scene
 *               code: hdt.scene_delete_failed
 *               status: 500
 */
router.delete('/:projectId/hdt/scenes/:sceneId', requireAuth, deleteSceneHandler);

/* ============================================================================
 * SCENE-ASSET ASSOCIATIONS
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects/{projectId}/hdt/scenes/{sceneId}/assets:
 *   post:
 *     summary: Add asset to scene
 *     description: Adds an existing asset reference to a scene (manager only).
 *     tags:
 *       - Scenes
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *       - in: path
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *         description: Scene ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SceneAssetReference'
 *     responses:
 *       201:
 *         description: HDT document updated (asset added to scene)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Only project managers or editors can modify scenes
 *               code: hdt.scene_editor_or_manager_required
 *               status: 403
 *       404:
 *         description: HDT document or scene not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: HDT document not found
 *               code: hdt.scene_document_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to add asset to scene
 *               code: hdt.scene_modify_failed
 *               status: 500
 */
router.post('/:projectId/hdt/scenes/:sceneId/assets', requireAuth, addAssetToSceneHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/scenes/{sceneId}/assets/{assetId}:
 *   put:
 *     summary: Update asset reference in scene
 *     description: Updates an asset reference (transform/visibility) inside a scene (manager only).
 *     tags:
 *       - Scenes
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *       - in: path
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *         description: Scene ID.
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SceneAssetReferenceUpdate'
 *     responses:
 *       200:
 *         description: HDT document updated (asset reference updated)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Only project managers or editors can modify scenes
 *               code: hdt.scene_editor_or_manager_required
 *               status: 403
 *       404:
 *         description: HDT document, scene or asset reference not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: HDT document not found
 *               code: hdt.scene_document_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to update asset in scene
 *               code: hdt.scene_modify_failed
 *               status: 500
 */
router.put('/:projectId/hdt/scenes/:sceneId/assets/:assetId', requireAuth, updateAssetInSceneHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/scenes/{sceneId}/assets/{assetId}:
 *   delete:
 *     summary: Remove asset from scene
 *     description: Removes an asset reference from a scene (manager only).
 *     tags:
 *       - Scenes
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *       - in: path
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *         description: Scene ID.
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID.
 *     responses:
 *       200:
 *         description: HDT document updated (asset removed from scene)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       403:
 *         description: Not authorized (manager only)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Only project managers or editors can modify scenes
 *               code: hdt.scene_editor_or_manager_required
 *               status: 403
 *       404:
 *         description: HDT document or scene not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: HDT document not found
 *               code: hdt.scene_document_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to remove asset from scene
 *               code: hdt.scene_modify_failed
 *               status: 500
 */
router.delete('/:projectId/hdt/scenes/:sceneId/assets/:assetId', requireAuth, removeAssetFromSceneHandler);

/* ============================================================================
 * EXPORTS
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects/{projectId}/export/rdf:
 *   get:
 *     summary: Export HDT metadata as RDF/XML
 *     description: Exports the project's HDT document metadata and 3d-model assets as RDF/XML (auth required).
 *     tags:
 *       - Exports
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID.
 *     responses:
 *       200:
 *         description: RDF/XML export
 *         content:
 *           application/rdf+xml:
 *             schema:
 *               type: string
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: hdt.authentication_required
 *               status: 401
 *       404:
 *         description: HDT document not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: HDT metadata not found
 *               code: hdt.document_not_found
 *               status: 404
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to export RDF
 *               code: hdt.fetch_failed
 *               status: 500
 */
router.get('/:projectId/export/rdf', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const hdtDoc = await getHDTDocument(projectId);

    if (!hdtDoc) {
      return res.status(404).json({ error: 'HDT metadata not found' });
    }

    const escapeXml = (unsafe: string | string[] | undefined): string => {
      if (!unsafe) return '';
      if (Array.isArray(unsafe)) return unsafe.map(s => escapeXml(s)).join(', ');
      return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case "'": return '&apos;';
          case '"': return '&quot;';
          default: return c;
        }
      });
    };

    const rdf = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:hdt="http://echoes-eccch.eu/hdt#"
  xmlns:prov="http://www.w3.org/ns/prov#"
  xmlns:foaf="http://xmlns.com/foaf/0.1/">

  <rdf:Description rdf:about="urn:project:${projectId}">
    <rdf:type rdf:resource="http://echoes-eccch.eu/hdt#HC1"/>
    <dc:title>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.title as any) || 'Untitled')}</dc:title>
    <dc:description>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.description as any) || '')}</dc:description>
    <dc:creator>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.creator as any) || '')}</dc:creator>
    <dc:date>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.date as any) || '')}</dc:date>
    <dc:coverage>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.coverage as any) || '')}</dc:coverage>
    <dc:rights>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.rights as any) || '')}</dc:rights>
    <dc:identifier>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.identifier as any) || '')}</dc:identifier>
    <dc:subject>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.subject as any) || '')}</dc:subject>
    <dc:type>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.type as any) || '')}</dc:type>
    <dc:language>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.language as any) || '')}</dc:language>
    <dc:source>${escapeXml((hdtDoc.physicalObjectMetadata?.dublinCore?.source as any) || '')}</dc:source>
    <dcterms:created>${hdtDoc.createdAt ? new Date(hdtDoc.createdAt).toISOString() : ''}</dcterms:created>
    <dcterms:modified>${hdtDoc.updatedAt ? new Date(hdtDoc.updatedAt).toISOString() : ''}</dcterms:modified>
    <hdt:HP1 rdf:resource="urn:project:${projectId}:hdt"/>
  </rdf:Description>

  <rdf:Description rdf:about="urn:project:${projectId}:hdt">
    <rdf:type rdf:resource="http://echoes-eccch.eu/hdt#HC2"/>
${(hdtDoc.digitalAssets || [])
  .filter((asset: any) => asset.type === '3d-model')
  .map((asset: any) => `    <hdt:HP3 rdf:resource="urn:asset:${asset.id}"/>`)
  .join('\n')}
  </rdf:Description>
${(hdtDoc.digitalAssets || [])
  .filter((asset: any) => asset.type === '3d-model')
  .map((asset: any) => `
  <rdf:Description rdf:about="urn:asset:${asset.id}">
    <rdf:type rdf:resource="http://echoes-eccch.eu/hdt#HC8"/>
    <dc:format>${escapeXml(asset.metadata?.format || 'model/gltf+json')}</dc:format>
    <dc:date>${asset.uploadedAt ? new Date(asset.uploadedAt).toISOString().split('T')[0] : ''}</dc:date>
    <dc:source>${escapeXml(asset.entryPointUrl || '')}</dc:source>
    <dc:title>${escapeXml(asset.title || asset.fileName || '')}</dc:title>
    <dc:description>${escapeXml(asset.description || '')}</dc:description>
    <hdt:HP21 rdf:resource="urn:project:${projectId}"/>
    <prov:wasGeneratedBy rdf:resource="urn:activity:${asset.id}"/>
  </rdf:Description>

  <rdf:Description rdf:about="urn:activity:${asset.id}">
    <rdf:type rdf:resource="http://www.w3.org/ns/prov#Activity"/>
    <prov:wasAttributedTo rdf:resource="urn:user:${asset.uploadedBy || 'unknown'}"/>
    <prov:endedAtTime>${asset.uploadedAt ? new Date(asset.uploadedAt).toISOString() : ''}</prov:endedAtTime>
  </rdf:Description>
`)
  .join('')}
</rdf:RDF>`;

    res.setHeader('Content-Type', 'application/rdf+xml');
    res.setHeader('Content-Disposition', `attachment; filename="hdt-${projectId}.rdf"`);
    return res.send(rdf);
  } catch (error: any) {
    console.error('Error exporting RDF:', error);
    return res.status(500).json({ error: error?.message || 'Failed to export RDF' });
  }
});

/**
 * @openapi
 * /api/projects/sparql-proxy:
 *   post:
 *     summary: SPARQL proxy
 *     description: Proxies POST requests to external SPARQL endpoints to avoid browser CORS issues (auth required).
 *     tags:
 *       - Exports
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *               - payload
 *             properties:
 *               endpoint:
 *                 type: string
 *                 example: https://example.org/sparql
 *               payload:
 *                 type: object
 *                 description: SPARQL request payload (implementation-specific).
 *     responses:
 *       200:
 *         description: Proxied SPARQL response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Missing endpoint or payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Missing endpoint or payload
 *               code: common.bad_request
 *               status: 400
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Authentication required
 *               code: common.authentication_required
 *               status: 401
 *       500:
 *         description: Proxy error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *             example:
 *               success: false
 *               error: Failed to query SPARQL endpoint
 *               code: common.internal_error
 *               status: 500
 */
router.post('/sparql-proxy', requireAuth, async (req, res) => {
  try {
    const { endpoint, payload } = req.body as { endpoint?: string; payload?: any };

    if (!endpoint || !payload) {
      return res.status(400).json({ error: 'Missing endpoint or payload' });
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `SPARQL endpoint returned ${response.status}: ${response.statusText}`
      });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error('SPARQL proxy error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to query SPARQL endpoint' });
  }
});

export default router;
