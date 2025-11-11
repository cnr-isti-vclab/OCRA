/**
 * HDT Metadata Routes
 * 
 * API endpoints for managing Heritage Digital Twin documents stored in MongoDB.
 * Includes metadata, digital assets, scenes, and scene-asset associations.
 * 
 * Routes:
 * - GET    /api/projects/:projectId/hdt - Get HDT document
 * - POST   /api/projects/:projectId/hdt - Create/initialize HDT document
 * - PUT    /api/projects/:projectId/hdt - Update HDT metadata
 * - DELETE /api/projects/:projectId/hdt - Delete HDT document
 * 
 * - POST   /api/projects/:projectId/hdt/assets - Add digital asset
 * - PUT    /api/projects/:projectId/hdt/assets/:assetId - Update asset
 * - DELETE /api/projects/:projectId/hdt/assets/:assetId - Remove asset
 * 
 * - GET    /api/projects/:projectId/scenes - List scenes
 * - POST   /api/projects/:projectId/hdt/scenes - Create scene
 * - PUT    /api/projects/:projectId/hdt/scenes/:sceneId - Update scene
 * - DELETE /api/projects/:projectId/hdt/scenes/:sceneId - Delete scene
 * 
 * - POST   /api/projects/:projectId/hdt/scenes/:sceneId/assets - Add asset to scene
 * - PUT    /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId - Update asset in scene
 * - DELETE /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId - Remove asset from scene
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
  getSceneFileHandler
} from '../controllers/hdt-metadata.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { getHDTDocument } from '../services/hdt-metadata.service.js';

const router = Router();

/**
 * @swagger
 * /api/projects/{projectId}/hdt:
 *   get:
 *     summary: Get HDT metadata for a project
 *     description: Retrieve Heritage Digital Twin metadata from MongoDB
 *     tags: [HDT Metadata]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: HDT metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projectId:
 *                   type: string
 *                 dublinCore:
 *                   type: object
 *                 cidocCrm:
 *                   type: object
 *                 gettyAAT:
 *                   type: object
 *                 license:
 *                   type: object
 *       404:
 *         description: HDT metadata not found
 *       500:
 *         description: Server error
 */
router.get('/:projectId/hdt', getHDTMetadataHandler);

/**
 * @swagger
 * /api/projects/{projectId}/hdt:
 *   post:
 *     summary: Create HDT metadata for a project
 *     description: Initialize Heritage Digital Twin metadata with defaults from project
 *     tags: [HDT Metadata]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       201:
 *         description: HDT metadata created
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only project managers can create metadata
 *       409:
 *         description: Metadata already exists
 *       500:
 *         description: Server error
 */
router.post('/:projectId/hdt', requireAuth, createHDTMetadataHandler);

/**
 * @swagger
 * /api/projects/{projectId}/hdt:
 *   put:
 *     summary: Update HDT metadata for a project
 *     description: Update Heritage Digital Twin metadata fields
 *     tags: [HDT Metadata]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
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
 *               gettyAAT:
 *                 type: object
 *               license:
 *                 type: object
 *     responses:
 *       200:
 *         description: HDT metadata updated
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only project managers can update metadata
 *       404:
 *         description: Metadata not found
 *       500:
 *         description: Server error
 */
router.put('/:projectId/hdt', requireAuth, updateHDTMetadataHandler);

/**
 * @swagger
 * /api/projects/{projectId}/hdt:
 *   delete:
 *     summary: Delete HDT metadata for a project
 *     description: Remove Heritage Digital Twin metadata
 *     tags: [HDT Metadata]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       200:
 *         description: HDT metadata deleted
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only project managers can delete metadata
 *       404:
 *         description: Metadata not found
 *       500:
 *         description: Server error
 */
router.delete('/:projectId/hdt', requireAuth, deleteHDTMetadataHandler);

// ==========================================
// DIGITAL ASSETS ROUTES
// ==========================================

/**
 * POST /api/projects/:projectId/hdt/assets
 * Add a digital asset to the pool
 */
router.post('/:projectId/hdt/assets', requireAuth, addAssetHandler);

/**
 * PUT /api/projects/:projectId/hdt/assets/:assetId
 * Update a digital asset
 */
router.put('/:projectId/hdt/assets/:assetId', requireAuth, updateAssetHandler);

/**
 * DELETE /api/projects/:projectId/hdt/assets/:assetId
 * Remove a digital asset
 */
router.delete('/:projectId/hdt/assets/:assetId', requireAuth, removeAssetHandler);

// ==========================================
// SCENE ROUTES
// ==========================================

/**
 * GET /api/projects/:projectId/scenes
 * List all available scenes (used by viewer)
 */
router.get('/:projectId/scenes', listScenesHandler);

/**
 * GET /api/projects/:projectId/scenes/:sceneId
 * Get a specific scene JSON file (used by ThreePresenter)
 */
router.get('/:projectId/scenes/:sceneId', getSceneFileHandler);

/**
 * POST /api/projects/:projectId/hdt/scenes
 * Create a new scene
 */
router.post('/:projectId/hdt/scenes', requireAuth, createSceneHandler);

/**
 * PUT /api/projects/:projectId/hdt/scenes/:sceneId
 * Update a scene
 */
router.put('/:projectId/hdt/scenes/:sceneId', requireAuth, updateSceneHandler);

/**
 * DELETE /api/projects/:projectId/hdt/scenes/:sceneId
 * Delete a scene
 */
router.delete('/:projectId/hdt/scenes/:sceneId', requireAuth, deleteSceneHandler);

// ==========================================
// SCENE-ASSET ASSOCIATION ROUTES
// ==========================================

/**
 * POST /api/projects/:projectId/hdt/scenes/:sceneId/assets
 * Add an asset to a scene
 */
router.post('/:projectId/hdt/scenes/:sceneId/assets', requireAuth, addAssetToSceneHandler);

/**
 * PUT /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId
 * Update an asset reference in a scene
 */
router.put('/:projectId/hdt/scenes/:sceneId/assets/:assetId', requireAuth, updateAssetInSceneHandler);

/**
 * DELETE /api/projects/:projectId/hdt/scenes/:sceneId/assets/:assetId
 * Remove an asset from a scene
 */
router.delete('/:projectId/hdt/scenes/:sceneId/assets/:assetId', requireAuth, removeAssetFromSceneHandler);

/**
 * GET /api/projects/:projectId/export/rdf
 * Export HDT metadata as RDF/Turtle
 */
router.get('/:projectId/export/rdf', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const hdtDoc = await getHDTDocument(projectId);

    if (!hdtDoc) {
      return res.status(404).json({ error: 'HDT metadata not found' });
    }

    // Generate basic RDF/Turtle export
    const rdf = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix hdt: <http://example.org/hdt#> .

<urn:project:${projectId}> a hdt:HeritageDigitalTwin ;
    dcterms:title "${hdtDoc.metadata?.dublinCore?.title || 'Untitled'}" ;
    dcterms:description "${hdtDoc.metadata?.dublinCore?.description || ''}" ;
    dcterms:creator "${hdtDoc.metadata?.dublinCore?.creator || ''}" ;
    dcterms:date "${hdtDoc.metadata?.dublinCore?.date || ''}" ;
    dcterms:created "${hdtDoc.createdAt || ''}" ;
    dcterms:modified "${hdtDoc.updatedAt || ''}" .
`;

    res.setHeader('Content-Type', 'text/turtle');
    res.setHeader('Content-Disposition', `attachment; filename="hdt-${projectId}.ttl"`);
    res.send(rdf);
  } catch (error: any) {
    console.error('Error exporting RDF:', error);
    res.status(500).json({ error: 'Failed to export RDF' });
  }
});

export default router;
