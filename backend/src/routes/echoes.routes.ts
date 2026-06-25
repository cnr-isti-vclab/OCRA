import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  clearEchoesDevBearerHandler,
  createProjectFromEchoesHdtHandler,
  getEchoesHdtHandler,
  listEchoesHdtsHandler,
  registerEchoesDevBearerHandler,
} from '../controllers/echoes.controller.js';

const router = express.Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/echoes/hdts:
 *   get:
 *     summary: List available ECHOES HDTs
 *     description: |
 *       Returns a minimal list of ECHOES Heritage Digital Twins available in the KB.
 *       Optionally filters the results by a free-text `search` string matched against label, title, or identifier.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Case-insensitive text filter applied to label, title, and identifier.
 *     responses:
 *       200:
 *         description: Minimal ECHOES HDT list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesHdtListResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       502:
 *         description: Upstream ECHOES KB query failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/hdts', listEchoesHdtsHandler);

/**
 * @openapi
 * /api/echoes/hdts/{hdtId}:
 *   get:
 *     summary: Get minimal details for one ECHOES HDT
 *     description: |
 *       Reads one ECHOES HDT from the KB, including HC1 metadata and linked HC8 assets.
 *       The `hdtId` path parameter must be the full HDT URI encoded with `encodeURIComponent(...)`.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: hdtId
 *         required: true
 *         schema:
 *           type: string
 *         description: Encoded ECHOES HDT URI, for example `http%3A%2F%2Fechoes-eccch.eu%2FHDT%2FJGrV52jtL3z`.
 *     responses:
 *       200:
 *         description: ECHOES HDT detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesHdtDetailResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       404:
 *         description: HDT not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       502:
 *         description: Upstream ECHOES KB query failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/hdts/:hdtId', getEchoesHdtHandler);

/**
 * @openapi
 * /api/echoes/projects:
 *   post:
 *     summary: Create an OCRA project from an ECHOES HDT
 *     description: |
 *       Creates a new OCRA project from a selected ECHOES HDT.
 *       The backend imports the minimal HC1 metadata and linked HC8 assets, then lets OCRA manage the default scene normally.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EchoesCreateProjectRequest'
 *     responses:
 *       201:
 *         description: Project created from ECHOES HDT
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesCreateProjectResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Caller cannot create projects
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       502:
 *         description: Import from ECHOES KB failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post('/projects', createProjectFromEchoesHdtHandler);

// @spike echoes-kb-dev-bearer: remove when EGI login reliably provides the KB bearer for every authenticated session
/**
 * @openapi
 * /api/echoes/dev/bearer:
 *   post:
 *     summary: Register a temporary ECHOES bearer for development
 *     description: |
 *       Development-only helper endpoint. Stores an override bearer token for the current authenticated OCRA session.
 *       This is a temporary bridge until the ECHOES KB bearer is obtained directly from the login flow.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EchoesDevBearerRequest'
 *     responses:
 *       204:
 *         description: Bearer registered for the current session
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       400:
 *         description: Missing bearer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post('/dev/bearer', registerEchoesDevBearerHandler);
// @spike echoes-kb-dev-bearer: remove when EGI login reliably provides the KB bearer for every authenticated session
/**
 * @openapi
 * /api/echoes/dev/bearer:
 *   delete:
 *     summary: Clear the temporary ECHOES bearer for development
 *     description: Removes the current session's development-only bearer override.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     responses:
 *       204:
 *         description: Bearer override removed
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.delete('/dev/bearer', clearEchoesDevBearerHandler);

export default router;
