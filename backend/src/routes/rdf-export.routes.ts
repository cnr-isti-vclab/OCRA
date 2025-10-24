/**
 * RDF Export Routes
 * 
 * API endpoints for exporting OCRA projects as RDF/Linked Data
 */

import express from 'express';
import { exportProjectAsRDF } from '../services/rdf-export.service.js';

const router = express.Router();

/**
 * @openapi
 * /api/projects/{projectId}/export/rdf:
 *   get:
 *     summary: Export project as RDF (Turtle format)
 *     description: |
 *       Exports an OCRA project's metadata as RDF using standard cultural heritage ontologies
 *       (Dublin Core, CIDOC-CRM). The output is in Turtle format (.ttl), which is human-readable
 *       and compatible with semantic web tools and triple stores.
 *     tags:
 *       - Projects
 *       - Export
 *       - RDF
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: The project ID to export
 *         example: clxxx123abc
 *     responses:
 *       200:
 *         description: RDF data in Turtle format
 *         content:
 *           text/turtle:
 *             schema:
 *               type: string
 *               example: |
 *                 @prefix dc: <http://purl.org/dc/elements/1.1/>.
 *                 @prefix ocra: <https://ocra.eccch.eu/hdt/>.
 *                 
 *                 ocra:clxxx123 a crm:E73_Information_Object;
 *                     dc:title "Bernini Angel Conservation Project";
 *                     dc:description "High-resolution 3D documentation...".
 *       404:
 *         description: Project not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Project not found
 *       500:
 *         description: Server error during RDF generation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
router.get('/:projectId/export/rdf', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    console.log(`📥 RDF export requested for project: ${projectId}`);
    
    // Generate RDF
    const rdfData = await exportProjectAsRDF(projectId);
    
    // Set headers for RDF content
    res.setHeader('Content-Type', 'text/turtle; charset=utf-8');
    
    console.log(`✅ RDF export successful for project: ${projectId}`);
    
    // Send the RDF data
    res.send(rdfData);
    
  } catch (error: any) {
    console.error('❌ RDF export error:', error);
    
    if (error.message.includes('not found')) {
      res.status(404).json({ 
        error: 'Project not found',
        projectId: req.params.projectId 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to generate RDF export',
        message: error.message 
      });
    }
  }
});

export default router;
