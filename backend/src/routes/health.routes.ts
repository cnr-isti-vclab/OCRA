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
 *                 service:
 *                   type: string
 *                   example: backend
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
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 mongo:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                       example: true
 *                     pingResult:
 *                       type: object
 *                       properties:
 *                         ok:
 *                           type: number
 *                           example: 1
 *                     lastPingMs:
 *                       type: number
 *                       example: 2
 *       500:
 *         description: MongoDB connection error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/mongo', mongoHealth);

export default router;