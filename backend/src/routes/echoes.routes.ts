import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  clearEchoesDevBearerHandler,
  createProjectFromEchoesHdtHandler,
  createProjectFromEchoesRdfHandler,
  duplicateProjectHdtAsNewInEchoesHandler,
  enrichProjectHdtInEchoesHandler,
  getEchoesProjectStatusHandler,
  getEchoesHdtHandler,
  importProjectFromEchoesRdfUploadMiddleware,
  listEchoesHdtsHandler,
  listEchoesNamedGraphsHandler,
  registerProjectHdtInEchoesHandler,
  registerEchoesDevBearerHandler,
  replaceProjectHdtContentInEchoesHandler,
  unregisterEchoesDigitalTwinHandler,
} from '../controllers/echoes.controller.js';

const router = express.Router();

router.use(requireAuth);

/**
 * @openapi
 * /api/eccch/hdts:
 *   get:
 *     summary: List registered ECCCH HDTs
 *     description: |
 *       Returns a minimal list of registered Digital Twins in ECCCH, including HDTs that do not yet have any named graph.
 *       Optionally filters the results by a free-text `search` string matched against label or Digital Twin URI.
 *     tags:
 *       - ECCCH
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Case-insensitive text filter applied to label and Digital Twin URI.
 *     responses:
 *       200:
 *         description: Minimal ECCCH HDT list
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
 *         description: Upstream ECCCH repository query failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/hdts', listEchoesHdtsHandler);

/**
 * @openapi
 * /api/eccch/named-graphs:
 *   get:
 *     summary: List available ECCCH named graphs
 *     description: |
 *       Returns a minimal list of named graphs available in the ECCCH repository,
 *       along with the related Digital Twin identifiers.
 *       Optionally filters the results by a free-text `search` string matched against label, title, or identifier.
 *     tags:
 *       - ECCCH
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
 *         description: Minimal ECCCH named graph list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesNamedGraphListResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       502:
 *         description: Upstream ECCCH repository query failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/named-graphs', listEchoesNamedGraphsHandler);

/**
 * @openapi
 * /api/eccch/hdts/{hdtId}:
 *   get:
 *     summary: Get minimal details for one ECCCH HDT
 *     description: |
 *       Reads one HDT from the ECCCH repository, including HC1 metadata and linked HC8 assets.
 *       The `hdtId` path parameter must be the full HDT URI encoded with `encodeURIComponent(...)`.
 *     tags:
 *       - ECCCH
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: hdtId
 *         required: true
 *         schema:
 *           type: string
 *         description: Encoded ECCCH HDT URI, for example `http%3A%2F%2Fechoes-eccch.eu%2FHDT%2FJGrV52jtL3z`.
 *     responses:
 *       200:
 *         description: ECCCH HDT detail
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
 *         description: Upstream ECCCH repository query failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.get('/hdts/:hdtId', getEchoesHdtHandler);

/**
 * @openapi
 * /api/eccch/projects:
 *   post:
 *     summary: Create an OCRA project from an ECCCH HDT
 *     description: |
 *       Creates a new OCRA project from a selected HDT in the ECCCH repository.
 *       The backend imports the minimal HC1 metadata and linked HC8 assets, then lets OCRA manage the default scene normally.
 *     tags:
 *       - ECCCH
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
 *         description: Project created from ECCCH HDT
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
 *         description: Import from ECCCH repository failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post('/projects', createProjectFromEchoesHdtHandler);
router.post('/projects/import-rdf', importProjectFromEchoesRdfUploadMiddleware, createProjectFromEchoesRdfHandler);

/**
 * @openapi
 * /api/eccch/projects/{projectId}/status:
 *   get:
 *     summary: Read ECCCH publication status for one OCRA project
 *     description: Returns the local ECCCH linkage and synchronization status currently stored for the project's HDT document.
 *     tags:
 *       - ECCCH
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
 *         description: Current ECCCH project status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesProjectStatusResponse'
 */
router.get('/projects/:projectId/status', getEchoesProjectStatusHandler);

/**
 * @openapi
 * /api/eccch/projects/{projectId}/register:
 *   post:
 *     summary: Register the local HDT in ECCCH
 *     description: Creates or confirms the ECCCH Digital Twin identifier for the local OCRA HDT, without uploading the RDF content yet.
 *     tags:
 *       - ECCCH
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
 *         description: HDT registered in ECCCH
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesRegisterProjectResponse'
 */
router.post('/projects/:projectId/register', registerProjectHdtInEchoesHandler);

/**
 * @openapi
 * /api/eccch/projects/{projectId}/enrich:
 *   post:
 *     summary: Publish the current local RDF as a new named graph in ECCCH
 *     description: Serializes the project's current HDT document as RDF/XML and uploads it through ECCCH `POST /hdt/enrich`.
 *     tags:
 *       - ECCCH
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
 *         description: RDF content published to ECCCH
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesPublishProjectResponse'
 */
router.post('/projects/:projectId/enrich', enrichProjectHdtInEchoesHandler);

/**
 * @openapi
 * /api/eccch/projects/{projectId}/replace-content:
 *   post:
 *     summary: Replace the linked ECCCH named graph with the current local RDF
 *     description: Serializes the local HDT document and sends it to ECCCH `POST /hdt/replaceContent`, replacing the currently linked named graph.
 *     tags:
 *       - ECCCH
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
 *         description: ECCCH named graph replaced successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesPublishProjectResponse'
 */
router.post('/projects/:projectId/replace-content', replaceProjectHdtContentInEchoesHandler);

/**
 * @openapi
 * /api/eccch/projects/{projectId}/duplicate-as-new-hdt:
 *   post:
 *     summary: Duplicate the current project as a brand new ECCCH HDT
 *     description: |
 *       System-admin-only operation.
 *       Registers a new Digital Twin in ECCCH, serializes the current project RDF with optional HC1 overrides,
 *       and publishes it as a new named graph without altering the current project's existing ECCCH linkage.
 *     tags:
 *       - ECCCH
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
 *         description: New ECCCH HDT created from this project
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesPublishProjectResponse'
 */
router.post('/projects/:projectId/duplicate-as-new-hdt', duplicateProjectHdtAsNewInEchoesHandler);


// @spike echoes-kb-dev-bearer: remove when EGI login reliably provides the KB bearer for every authenticated session
/**
 * @openapi
 * /api/eccch/dev/bearer:
 *   post:
 *     summary: Register a temporary ECCCH bearer for development
 *     description: |
 *       Development-only helper endpoint. Stores an override bearer token for the current authenticated OCRA session.
 *       This is a temporary bridge until the ECCCH bearer is obtained directly from the login flow.
 *       The override is session-wide and can be managed only by system administrators.
 *     tags:
 *       - ECCCH
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
 * /api/eccch/dev/bearer:
 *   delete:
 *     summary: Clear the temporary ECCCH bearer for development
 *     description: Removes the current session's development-only bearer override.
 *     tags:
 *       - ECCCH
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

// @spike feature/eccch-unregister-debug: remove after ECCCH unregister is no longer needed in production
/**
 * @openapi
 * /api/eccch/dev/unregister-digital-twin:
 *   post:
 *     summary: Unregister an ECCCH Digital Twin by URI
 *     description: |
 *       Development-only administrative helper.
 *       Calls the upstream ECCCH `/hdt/unregister` endpoint for the provided `digitalTwinUri`.
 *       If one or more local OCRA projects are linked to that Digital Twin, their local ECCCH linkage is cleared.
 *     tags:
 *       - ECCCH
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EchoesUnregisterDigitalTwinRequest'
 *     responses:
 *       200:
 *         description: Digital Twin unregistered and local links updated when applicable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EchoesUnregisterDigitalTwinResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 *       403:
 *         description: Admin privileges required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiErrorResponse'
 */
router.post('/dev/unregister-digital-twin', unregisterEchoesDigitalTwinHandler);

export default router;
