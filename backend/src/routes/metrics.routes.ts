/**
 * Metrics Routes
 *
 * Prometheus scrape endpoint for the ECHOES monitoring platform.
 */

import express, { Router } from 'express';
import { getMetrics, requireMetricsToken } from '../controllers/metrics.controller.js';

const router: Router = express.Router();

/**
 * @openapi
 * /metrics:
 *   get:
 *     summary: Prometheus metrics
 *     description: >
 *       Service-level and usage metrics in Prometheus text format. Disabled (404) unless
 *       METRICS_TOKEN is configured; requires `Authorization: Bearer <METRICS_TOKEN>`.
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Metrics in Prometheus text exposition format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       401:
 *         description: Missing or invalid metrics token
 *       404:
 *         description: Metrics endpoint not enabled
 */
router.get('/', requireMetricsToken, getMetrics);

export default router;
