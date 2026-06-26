import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  clearEchoesDevBearerHandler,
  createProjectFromEchoesHdtHandler,
  duplicateProjectHdtAsNewInEchoesHandler,
  enrichProjectHdtInEchoesHandler,
  getEchoesProjectStatusHandler,
  getEchoesHdtHandler,
  listEchoesHdtsHandler,
  registerProjectHdtInEchoesHandler,
  registerEchoesDevBearerHandler,
  replaceProjectHdtContentInEchoesHandler,
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

/**
 * @openapi
 * /api/echoes/projects/{projectId}/status:
 *   get:
 *     summary: Read ECHOES publication status for one OCRA project
 *     description: Returns the local ECHOES linkage and synchronization status currently stored for the project's HDT document.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Current ECHOES project status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesProjectStatusResponse'
 */
router.get('/projects/:projectId/status', getEchoesProjectStatusHandler);

/**
 * @openapi
 * /api/echoes/projects/{projectId}/register:
 *   post:
 *     summary: Register the local HDT in ECHOES
 *     description: Creates or confirms the ECHOES Digital Twin identifier for the local OCRA HDT, without uploading the RDF content yet.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: HDT registered in ECHOES
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesRegisterProjectResponse'
 */
router.post('/projects/:projectId/register', registerProjectHdtInEchoesHandler);

/**
 * @openapi
 * /api/echoes/projects/{projectId}/enrich:
 *   post:
 *     summary: Publish the current local RDF as a new named graph in ECHOES
 *     description: Serializes the project's current HDT document as RDF/XML and uploads it through ECHOES `POST /hdt/enrich`.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: RDF content published to ECHOES
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesPublishProjectResponse'
 */
router.post('/projects/:projectId/enrich', enrichProjectHdtInEchoesHandler);

/**
 * @openapi
 * /api/echoes/projects/{projectId}/replace-content:
 *   post:
 *     summary: Replace the linked ECHOES named graph with the current local RDF
 *     description: Serializes the local HDT document and sends it to ECHOES `POST /hdt/replaceContent`, replacing the currently linked named graph.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: ECHOES named graph replaced successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesPublishProjectResponse'
 */
router.post('/projects/:projectId/replace-content', replaceProjectHdtContentInEchoesHandler);

/**
 * @openapi
 * /api/echoes/projects/{projectId}/duplicate-as-new-hdt:
 *   post:
 *     summary: Duplicate the current project as a brand new ECHOES HDT
 *     description: |
 *       System-admin-only operation.
 *       Registers a new Digital Twin in ECHOES, serializes the current project RDF with optional HC1 overrides,
 *       and publishes it as a new named graph without altering the current project's existing ECHOES linkage.
 *     tags:
 *       - ECHOES
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EchoesDuplicateProjectRequest'
 *     responses:
 *       200:
 *         description: New ECHOES HDT created from this project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesPublishProjectResponse'
 */
router.post('/projects/:projectId/duplicate-as-new-hdt', duplicateProjectHdtAsNewInEchoesHandler);

// @spike echoes-kb-dev-bearer: remove when EGI login reliably provides the KB bearer for every authenticated session
/**
 * @openapi
 * /api/echoes/dev/bearer:
 *   post:
 *     summary: Register a temporary ECHOES bearer for development
 *     description: |
 *       Development-only helper endpoint. Stores an override bearer token for the current authenticated OCRA session.
 *       This is a temporary bridge until the ECHOES KB bearer is obtained directly from the login flow.
 *       The request must declare a `scope` (`import`, `register`, `publish`) so the backend can enforce the matching role policy.
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
 *     description: Removes the current session's development-only bearer override for the requested scope authorization context.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EchoesDevBearerRequest'
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
