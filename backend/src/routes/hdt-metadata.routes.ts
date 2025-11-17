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

import e, { Router } from 'express';
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
 * GET /api/projects/:projectId/scenes/:sceneId/export
 * Export scene JSON file to disk (for debugging)
 */
router.get('/:projectId/scenes/:sceneId/export', requireAuth, exportSceneFileHandler);

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
 * Export HDT metadata as RDF/XML
 */
router.get('/:projectId/export/rdf', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const hdtDoc = await getHDTDocument(projectId);

    if (!hdtDoc) {
      return res.status(404).json({ error: 'HDT metadata not found' });
    }

    // Helper function to escape XML
    const escapeXml = (unsafe: string | string[] | undefined): string => {
      if (!unsafe) return '';
      if (Array.isArray(unsafe)) {
        return unsafe.map(s => escapeXml(s)).join(', ');
      }
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

    // Generate RDF/XML export
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
    <dc:title>${escapeXml(hdtDoc.metadata?.dublinCore?.title as any || 'Untitled')}</dc:title>
    <dc:description>${escapeXml(hdtDoc.metadata?.dublinCore?.description as any || '')}</dc:description>
    <dc:creator>${escapeXml(hdtDoc.metadata?.dublinCore?.creator as any || '')}</dc:creator>
    <dc:date>${escapeXml(hdtDoc.metadata?.dublinCore?.date as any || '')}</dc:date>
    <dc:coverage>${escapeXml(hdtDoc.metadata?.dublinCore?.coverage as any || '')}</dc:coverage>
    <dc:rights>${escapeXml(hdtDoc.metadata?.dublinCore?.rights as any || '')}</dc:rights>
    <dc:identifier>${escapeXml(hdtDoc.metadata?.dublinCore?.identifier as any || '')}</dc:identifier>
    <dc:subject>${escapeXml(hdtDoc.metadata?.dublinCore?.subject as any || '')}</dc:subject>
    <dc:type>${escapeXml(hdtDoc.metadata?.dublinCore?.type as any || '')}</dc:type>
    <dc:language>${escapeXml(hdtDoc.metadata?.dublinCore?.language as any || '')}</dc:language>
    <dc:source>${escapeXml(hdtDoc.metadata?.dublinCore?.source as any || '')}</dc:source>
    <dcterms:created>${hdtDoc.createdAt ? new Date(hdtDoc.createdAt).toISOString() : ''}</dcterms:created>
    <dcterms:modified>${hdtDoc.updatedAt ? new Date(hdtDoc.updatedAt).toISOString() : ''}</dcterms:modified>
    <hdt:HP1 rdf:resource="urn:project:${projectId}:hdt"/>
  </rdf:Description>

  <rdf:Description rdf:about="urn:project:${projectId}:hdt">
    <rdf:type rdf:resource="http://echoes-eccch.eu/hdt#HC2"/>
${(hdtDoc.digitalAssets || []).filter((asset: any) => asset.type === 'model3d').map((asset: any) => 
    `    <hdt:HP3 rdf:resource="urn:asset:${asset.id}"/>`
).join('\n')}
  </rdf:Description>
${(hdtDoc.digitalAssets || []).filter((asset: any) => asset.type === 'model3d').map((asset: any) => `
  <rdf:Description rdf:about="urn:asset:${asset.id}">
    <rdf:type rdf:resource="http://echoes-eccch.eu/hdt#HC8"/>
    <dc:format>${escapeXml(asset.metadata?.format || 'model/gltf+json')}</dc:format>
    <dc:date>${asset.uploadedAt ? new Date(asset.uploadedAt).toISOString().split('T')[0] : ''}</dc:date>
    <dc:source>${escapeXml(asset.fileUrl || '')}</dc:source>
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
`).join('')}
</rdf:RDF>`;

    res.setHeader('Content-Type', 'application/rdf+xml');
    res.setHeader('Content-Disposition', `attachment; filename="hdt-${projectId}.rdf"`);
    res.send(rdf);
  } catch (error: any) {
    console.error('Error exporting RDF:', error);
    res.status(500).json({ error: 'Failed to export RDF'+ error });
  }
});

// CORS proxy for SPARQL endpoints (to avoid CORS issues when querying external APIs)
router.post('/sparql-proxy', requireAuth, async (req, res) => {
  try {
    const { endpoint, payload } = req.body;
    
    if (!endpoint || !payload) {
      return res.status(400).json({ error: 'Missing endpoint or payload' });
    }
    
    // Forward the request to the SPARQL endpoint
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `SPARQL endpoint returned ${response.status}: ${response.statusText}` 
      });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('SPARQL proxy error:', error);
    res.status(500).json({ error: error.message || 'Failed to query SPARQL endpoint' });
  }
});

export default router;
