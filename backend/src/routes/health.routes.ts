/**
 * Health Routes
 * 
 * Route definitions for health check endpoints
 */

import express, { Router } from 'express';
import { healthCheck, readinessCheck } from '../controllers/health.controller.js';

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
 * /health/ready:
 *   get:
 *     summary: Composite readiness check
 *     description: Returns readiness for OCRA external traffic only when PostgreSQL, MongoDB, and OIDC are all reachable and usable.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: All required OCRA dependencies are ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                   example: true
 *                 service:
 *                   type: string
 *                   example: backend
 *                 checks:
 *                   type: object
 *                   properties:
 *                     postgres:
 *                       type: object
 *                       properties:
 *                         ready:
 *                           type: boolean
 *                           example: true
 *                         latencyMs:
 *                           type: number
 *                           example: 4
 *                     mongo:
 *                       type: object
 *                       properties:
 *                         ready:
 *                           type: boolean
 *                           example: true
 *                         latencyMs:
 *                           type: number
 *                           example: 3
 *                     oidc:
 *                       type: object
 *                       properties:
 *                         ready:
 *                           type: boolean
 *                           example: true
 *                         issuer:
 *                           type: string
 *                           example: https://keycloak.example.test/realms/ocra
 *                         discoveryUrl:
 *                           type: string
 *                           example: https://keycloak.example.test/realms/ocra/.well-known/openid-configuration
 *                         latencyMs:
 *                           type: number
 *                           example: 12
 *       503:
 *         description: At least one required OCRA dependency is not ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                   example: false
 *                 service:
 *                   type: string
 *                   example: backend
 *                 checks:
 *                   type: object
 */
router.get('/ready', readinessCheck);

export default router;
