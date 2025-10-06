/**
 * Health Routes
 * 
 * Route definitions for health check endpoints
 */

import express, { Router } from 'express';
import { healthCheck, mongoHealth } from '../controllers/health.controller.js';

const router: Router = express.Router();

// (router debug middleware removed)

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Basic health check
 *     description: Returns the health status of the backend server
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/', healthCheck);

/**
 * @openapi
 * /health/mongo:
 *   get:
 *     summary: MongoDB health check
 *     description: Checks the health and connectivity of the MongoDB database
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: MongoDB is healthy and connected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 database:
 *                   type: string
 *                   example: connected
 *                 collections:
 *                   type: number
 *                   example: 5
 *       500:
 *         description: MongoDB connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/mongo', mongoHealth);

export default router;