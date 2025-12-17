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
import { getHDTDocument } from '../services/hdt-metadata.service.js';

const router = Router();

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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document not found
 *       500:
 *         description: Server error
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
 *             schema:
 *               $ref: '#/components/schemas/DigitalAssetUpdate'
 *     responses:
 *       200:
 *         description: HDT document updated (asset updated)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document or asset not found
 *       500:
 *         description: Server error
 */
router.put('/:projectId/hdt/assets/:assetId', requireAuth, updateAssetHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/assets/{assetId}:
 *   delete:
 *     summary: Remove a digital asset
 *     description: Removes a digital asset from the HDT document (and all scenes). For RTI assets, also removes files on disk (manager only).
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document or asset not found
 *       500:
 *         description: Server error
 */
router.delete('/:projectId/hdt/assets/:assetId', requireAuth, removeAssetHandler);

/* ============================================================================
 * HDT DOCUMENT (MongoDB)
 * ============================================================================
 */

/**
 * @openapi
 * /api/projects/{projectId}/hdt:
 *   get:
 *     summary: Get HDT document
 *     description: Retrieves the full HDT document for a project from MongoDB.
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
 *         description: HDT document
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *       404:
 *         description: HDT document not found
 *       500:
 *         description: Server error
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
 *               dublinCore:
 *                 type: object
 *               cidocCrm:
 *                 type: object
 *     responses:
 *       201:
 *         description: HDT document created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: Project not found
 *       409:
 *         description: HDT document already exists
 *       500:
 *         description: Server error
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
 *               dublinCore:
 *                 type: object
 *               cidocCrm:
 *                 type: object
 *     responses:
 *       200:
 *         description: HDT document updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HDTDocument'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document not found
 *       500:
 *         description: Server error
 */
router.put('/:projectId/hdt', requireAuth, updateHDTMetadataHandler);

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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document not found
 *       500:
 *         description: Server error
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document not found
 *       500:
 *         description: Server error
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document or asset not found
 *       500:
 *         description: Server error
 */
router.put('/:projectId/hdt/assets/:assetId', requireAuth, updateAssetHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/assets/{assetId}:
 *   delete:
 *     summary: Remove a digital asset
 *     description: Removes a digital asset from the HDT document (and all scenes). For RTI assets, also removes files on disk (manager only).
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document or asset not found
 *       500:
 *         description: Server error
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
 *       500:
 *         description: Server error
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
 *       404:
 *         description: Scene not found
 *       500:
 *         description: Server error
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
 *       404:
 *         description: Scene not found
 *       500:
 *         description: Server error
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document not found
 *       500:
 *         description: Server error
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document or scene not found
 *       500:
 *         description: Server error
 */
router.put('/:projectId/hdt/scenes/:sceneId', requireAuth, updateSceneHandler);

/**
 * @openapi
 * /api/projects/{projectId}/hdt/scenes/{sceneId}:
 *   delete:
 *     summary: Delete a scene
 *     description: Deletes a scene from the project's HDT document (manager only).
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document or scene not found
 *       500:
 *         description: Server error
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document or scene not found
 *       500:
 *         description: Server error
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document, scene or asset reference not found
 *       500:
 *         description: Server error
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
 *       403:
 *         description: Not authorized (manager only)
 *       404:
 *         description: HDT document or scene not found
 *       500:
 *         description: Server error
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
 *       404:
 *         description: HDT document not found
 *       500:
 *         description: Server error
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
    <dc:title>${escapeXml((hdtDoc.metadata?.dublinCore?.title as any) || 'Untitled')}</dc:title>
    <dc:description>${escapeXml((hdtDoc.metadata?.dublinCore?.description as any) || '')}</dc:description>
    <dc:creator>${escapeXml((hdtDoc.metadata?.dublinCore?.creator as any) || '')}</dc:creator>
    <dc:date>${escapeXml((hdtDoc.metadata?.dublinCore?.date as any) || '')}</dc:date>
    <dc:coverage>${escapeXml((hdtDoc.metadata?.dublinCore?.coverage as any) || '')}</dc:coverage>
    <dc:rights>${escapeXml((hdtDoc.metadata?.dublinCore?.rights as any) || '')}</dc:rights>
    <dc:identifier>${escapeXml((hdtDoc.metadata?.dublinCore?.identifier as any) || '')}</dc:identifier>
    <dc:subject>${escapeXml((hdtDoc.metadata?.dublinCore?.subject as any) || '')}</dc:subject>
    <dc:type>${escapeXml((hdtDoc.metadata?.dublinCore?.type as any) || '')}</dc:type>
    <dc:language>${escapeXml((hdtDoc.metadata?.dublinCore?.language as any) || '')}</dc:language>
    <dc:source>${escapeXml((hdtDoc.metadata?.dublinCore?.source as any) || '')}</dc:source>
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
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Proxy error
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
