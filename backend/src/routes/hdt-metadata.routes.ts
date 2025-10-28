/**
 * HDT Metadata Routes
 * 
 * API endpoints for managing Heritage Digital Twin metadata stored in MongoDB.
 * 
 * Routes:
 * - GET    /api/projects/:projectId/hdt - Get HDT metadata
 * - POST   /api/projects/:projectId/hdt - Create/initialize HDT metadata
 * - PUT    /api/projects/:projectId/hdt - Update HDT metadata
 * - DELETE /api/projects/:projectId/hdt - Delete HDT metadata
 */

import { Router } from 'express';
import {
  getHDTMetadataHandler,
  createHDTMetadataHandler,
  updateHDTMetadataHandler,
  deleteHDTMetadataHandler
} from '../controllers/hdt-metadata.controller.js';

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
router.post('/:projectId/hdt', createHDTMetadataHandler);

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
router.put('/:projectId/hdt', updateHDTMetadataHandler);

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
router.delete('/:projectId/hdt', deleteHDTMetadataHandler);

export default router;
