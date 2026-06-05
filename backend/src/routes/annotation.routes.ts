import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceStructuringLock } from '../middleware/project-structuring-lock.js';
import {
  createAnnotationDataHandler,
  createAnnotationGeometryHandler,
  createAnnotationLinkHandler,
  getAnnotationsHandler,
  getAnnotationDataForSceneHandler,
  getAnnotationDataHandler,
  getAnnotationGeometriesForSceneHandler,
  getAnnotationGeometryHandler,
  getAnnotationLinkHandler,
  getAnnotationLinksForSceneHandler,
  getAnnotationLinksHandler,
  markAnnotationDataErasableHandler,
  markAnnotationDataNonErasableHandler,
  markAnnotationGeometryErasableHandler,
  markAnnotationGeometryNonErasableHandler,
  markAnnotationLinkErasableHandler,
  markAnnotationLinkNonErasableHandler,
  notifyAnnotationSocialLockStartHandler,
  notifyAnnotationSocialLockStopHandler,
  subscribeAnnotationEventsHandler,
  updateAnnotationDataHandler,
  updateAnnotationGeometryHandler,
} from '../controllers/annotation.controller.js';

const router = Router();

router.use('/:projectId', enforceStructuringLock);

/**
 * @openapi
 * /api/projects/{projectId}/annotations:
 *   get:
 *     summary: Load annotations for a project or scene
 *     description: Returns geometries, data records, and links in one round-trip. When `sceneId` is provided, the response is filtered to entities visible in that scene; otherwise all project annotations are returned. Geometry and data may still be returned even when they are erasable if at least one non-erasable link keeps them alive.
 *     tags:
 *       - Annotations
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sceneId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional scene filter. When present, only annotations visible in that scene are returned.
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *         description: Include weak entities and weak links in the response even when they would otherwise be hidden by the default visibility filter.
 *     responses:
 *       200:
 *         description: Scene annotation bundle
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnnotationSceneBundle'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Project access denied
 *       404:
 *         description: Scene not found
 */
router.get('/:projectId/annotations', requireAuth, getAnnotationsHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/events:
 *   get:
 *     summary: Subscribe to annotation SSE events
 *     description: Opens a Server-Sent Events stream for broadcast-network social-lock and committed annotation mutation notifications.
 *     tags:
 *       - Annotations
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sceneId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional subscriber scene context. When present, event delivery is filtered to impacts that affect the scene; when omitted, all project events are streamed.
 *     responses:
 *       200:
 *         description: SSE stream established
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: |
 *                 retry: 5000
 *
 *                 event: annotation.connected
 *                 data: {"type":"annotation.connected","streamId":"9b63d0b8-a5b9-4a70-94d4-bd9c984e4a15"}
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Project access denied
 */
router.get('/:projectId/annotations/events', requireAuth, subscribeAnnotationEventsHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/events/social-lock/start:
 *   post:
 *     summary: Broadcast social-lock start
 *     description: Sends an informational social-lock start notification (presence or editor) to active annotation SSE subscribers.
 *     tags:
 *       - Annotations
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [streamId, originScopeType, originScopeId]
 *             properties:
 *               streamId:
 *                 type: string
 *                 format: uuid
 *               lockKind:
 *                 type: string
 *                 enum: [presence, editor]
 *                 description: Optional explicit lock kind. If omitted, backend infers editor when resourceType/resourceId are provided, otherwise presence.
 *               originScopeType:
 *                 type: string
 *                 enum: [scene, asset]
 *               originScopeId:
 *                 type: string
 *               resourceType:
 *                 type: string
 *                 enum: [geometry, data, link]
 *                 description: Required with resourceId for editor locks. Omit for presence locks.
 *               resourceId:
 *                 type: string
 *                 description: Required with resourceType for editor locks. Omit for presence locks.
 *               activity:
 *                 type: string
 *     responses:
 *       202:
 *         description: Social-lock notification accepted
 *       400:
 *         description: Invalid payload
 *       404:
 *         description: Referenced SSE stream not found
 *       409:
 *         description: Stream scope mismatch
 */
router.post('/:projectId/annotations/events/social-lock/start', requireAuth, notifyAnnotationSocialLockStartHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/events/social-lock/stop:
 *   post:
 *     summary: Broadcast social-lock stop
 *     description: Clears a previously announced informational social-lock (presence or editor) and notifies active subscribers.
 *     tags:
 *       - Annotations
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [streamId, originScopeType, originScopeId]
 *             properties:
 *               streamId:
 *                 type: string
 *                 format: uuid
 *               lockKind:
 *                 type: string
 *                 enum: [presence, editor]
 *                 description: Optional explicit lock kind. If omitted, backend infers editor when resourceType/resourceId are provided, otherwise presence.
 *               originScopeType:
 *                 type: string
 *                 enum: [scene, asset]
 *               originScopeId:
 *                 type: string
 *               resourceType:
 *                 type: string
 *                 enum: [geometry, data, link]
 *                 description: Required with resourceId for editor locks. Omit for presence locks.
 *               resourceId:
 *                 type: string
 *                 description: Required with resourceType for editor locks. Omit for presence locks.
 *               activity:
 *                 type: string
 *     responses:
 *       202:
 *         description: Social-lock removal accepted
 *       400:
 *         description: Invalid payload
 *       404:
 *         description: Referenced SSE stream not found
 *       409:
 *         description: Social-lock not found or stream scope mismatch
 */
router.post('/:projectId/annotations/events/social-lock/stop', requireAuth, notifyAnnotationSocialLockStopHandler);

/**
 * @openapi
 * /api/projects/{projectId}/annotations/geometry:
 *   get:
 *     summary: Get annotation geometries for a project or scene
 *     description: Returns geometries for the whole project, or only geometries visible in one scene when `sceneId` is provided. By default, an erasable geometry may still be included if at least one non-erasable link keeps it alive.
 *     tags:
 *       - Annotation Geometry
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sceneId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional scene filter. When present, only geometries visible in that scene are returned.
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Geometries visible in the scene
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 geometries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AnnotationGeometry'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Project access denied
 *       404:
 *         description: Scene not found
 */
router.get('/:projectId/annotations/geometry', requireAuth, getAnnotationGeometriesForSceneHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/geometry/{geometryId}:
 *   get:
 *     summary: Get a single annotation geometry
 *     tags:
 *       - Annotation Geometry
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: geometryId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Annotation geometry
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 geometry:
 *                   $ref: '#/components/schemas/AnnotationGeometry'
 *       404:
 *         description: Annotation geometry not found
 */
router.get('/:projectId/annotations/geometry/:geometryId', requireAuth, getAnnotationGeometryHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/geometry:
 *   post:
 *     summary: Create an annotation geometry
 *     tags:
 *       - Annotation Geometry
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shapes, referenceType, referenceId]
 *             properties:
 *               shapes:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/AnnotationShape'
 *               referenceType:
 *                 type: string
 *                 enum: [scene, asset]
 *               referenceId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Geometry created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 geometry:
 *                   $ref: '#/components/schemas/AnnotationGeometry'
 *       400:
 *         description: Invalid geometry payload
 *       404:
 *         description: Referenced scene or asset not found
 *       409:
 *         description: Generated geometry id already exists
 */
router.post('/:projectId/annotations/geometry', requireAuth, createAnnotationGeometryHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/geometry/{geometryId}:
 *   put:
 *     summary: Update annotation geometry shapes
 *     tags:
 *       - Annotation Geometry
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: geometryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion, shapes]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *               shapes:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/AnnotationShape'
 *     responses:
 *       200:
 *         description: Geometry updated
 *       400:
 *         description: Invalid geometry update payload or semantically invalid geometry document
 *       404:
 *         description: Annotation geometry not found
 *       409:
 *         description: Geometry version conflict
 */
router.put('/:projectId/annotations/geometry/:geometryId', requireAuth, updateAnnotationGeometryHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/geometry/{geometryId}/erasable:
 *   patch:
 *     summary: Mark annotation geometry erasable
 *     tags:
 *       - Annotation Geometry
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: geometryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Geometry marked erasable
 *       400:
 *         description: Missing expectedVersion or invalid transition result
 *       404:
 *         description: Annotation geometry not found
 *       409:
 *         description: Geometry already erasable or version conflict
 */
router.patch('/:projectId/annotations/geometry/:geometryId/erasable', requireAuth, markAnnotationGeometryErasableHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/geometry/{geometryId}/nonerasable:
 *   patch:
 *     summary: Restore annotation geometry to non-erasable
 *     tags:
 *       - Annotation Geometry
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: geometryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Geometry restored
 *       400:
 *         description: Missing expectedVersion or invalid transition result
 *       404:
 *         description: Annotation geometry not found
 *       409:
 *         description: Geometry already non-erasable or version conflict
 */
router.patch('/:projectId/annotations/geometry/:geometryId/nonerasable', requireAuth, markAnnotationGeometryNonErasableHandler);

/**
 * @openapi
 * /api/projects/{projectId}/annotations/data:
 *   get:
 *     summary: Get annotation data for a project or scene
 *     description: Returns annotation data for the whole project, or only data visible in one scene when `sceneId` is provided. By default, an erasable data record may still be included if at least one non-erasable link keeps it alive.
 *     tags:
 *       - Annotation Data
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: sceneId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional scene filter. When present, only data visible in that scene are returned.
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Data visible in the scene
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Project access denied
 *       404:
 *         description: Scene not found
 */
router.get('/:projectId/annotations/data', requireAuth, getAnnotationDataForSceneHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/data/{dataId}:
 *   get:
 *     summary: Get a single annotation data record
 *     tags:
 *       - Annotation Data
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dataId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Annotation data
 *       404:
 *         description: Annotation data not found
 */
router.get('/:projectId/annotations/data/:dataId', requireAuth, getAnnotationDataHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/data:
 *   post:
 *     summary: Create annotation data
 *     tags:
 *       - Annotation Data
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label, content, visibilityType, visibilityId]
 *             properties:
 *               label:
 *                 type: string
 *               description:
 *                 type: string
 *               class:
 *                 type: string
 *                 nullable: true
 *               content:
 *                 type: object
 *                 additionalProperties: true
 *               visibilityType:
 *                 type: string
 *                 enum: [scene, asset]
 *               visibilityId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Annotation data created
 *       400:
 *         description: Invalid annotation data payload or semantically invalid annotation data document
 *       404:
 *         description: Referenced scene or asset not found
 *       409:
 *         description: Generated annotation data id already exists
 */
router.post('/:projectId/annotations/data', requireAuth, createAnnotationDataHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/data/{dataId}:
 *   put:
 *     summary: Update annotation data mutable fields
 *     tags:
 *       - Annotation Data
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dataId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *               label:
 *                 type: string
 *               description:
 *                 type: string
 *               class:
 *                 type: string
 *                 nullable: true
 *               content:
 *                 type: object
 *                 additionalProperties: true
 *     responses:
 *       200:
 *         description: Annotation data updated
 *       400:
 *         description: Invalid payload, immutable fields included, or semantically invalid annotation data document
 *       404:
 *         description: Annotation data not found
 *       409:
 *         description: Annotation data version conflict
 */
router.put('/:projectId/annotations/data/:dataId', requireAuth, updateAnnotationDataHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/data/{dataId}/erasable:
 *   patch:
 *     summary: Mark annotation data erasable
 *     tags:
 *       - Annotation Data
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dataId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Annotation data marked erasable
 *       400:
 *         description: Missing expectedVersion or invalid transition result
 *       404:
 *         description: Annotation data not found
 *       409:
 *         description: Annotation data already erasable or version conflict
 */
router.patch('/:projectId/annotations/data/:dataId/erasable', requireAuth, markAnnotationDataErasableHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/data/{dataId}/nonerasable:
 *   patch:
 *     summary: Restore annotation data to non-erasable
 *     tags:
 *       - Annotation Data
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dataId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Annotation data restored
 *       400:
 *         description: Missing expectedVersion or invalid transition result
 *       404:
 *         description: Annotation data not found
 *       409:
 *         description: Annotation data already non-erasable or version conflict
 */
router.patch('/:projectId/annotations/data/:dataId/nonerasable', requireAuth, markAnnotationDataNonErasableHandler);

/**
 * @openapi
 * /api/projects/{projectId}/annotations/links:
 *   get:
 *     summary: List annotation links for the project
 *     tags:
 *       - Annotation Links
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: geometryId
 *         schema:
 *           type: string
 *       - in: query
 *         name: dataId
 *         schema:
 *           type: string
 *       - in: query
 *         name: sceneId
 *         schema:
 *           type: string
 *         description: Optional scene filter. When present, only links visible in that scene are returned before applying `geometryId` and `dataId` filters.
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Annotation links
 */
router.get('/:projectId/annotations/links', requireAuth, getAnnotationLinksHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/links/{linkId}:
 *   get:
 *     summary: Get a single annotation link
 *     tags:
 *       - Annotation Links
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: linkId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Annotation link
 *       404:
 *         description: Annotation link not found
 */
router.get('/:projectId/annotations/links/:linkId', requireAuth, getAnnotationLinkHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/links:
 *   post:
 *     summary: Create an annotation link
 *     tags:
 *       - Annotation Links
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [geometryId, dataId]
 *             properties:
 *               geometryId:
 *                 type: string
 *               dataId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Annotation link created
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: Referenced geometry or annotation data not found
 *       409:
 *         description: Project annotation context unavailable, duplicate pair, or scope consistency violation
 */
router.post('/:projectId/annotations/links', requireAuth, createAnnotationLinkHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/links/{linkId}/erasable:
 *   patch:
 *     summary: Mark an annotation link erasable
 *     tags:
 *       - Annotation Links
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: linkId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Annotation link marked erasable
 *       400:
 *         description: Missing expectedVersion or invalid transition result
 *       404:
 *         description: Annotation link not found
 *       409:
 *         description: Annotation link already erasable or version conflict
 */
router.patch('/:projectId/annotations/links/:linkId/erasable', requireAuth, markAnnotationLinkErasableHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/links/{linkId}/nonerasable:
 *   patch:
 *     summary: Restore an annotation link
 *     description: Restores only the link itself. This primitive transition does not restore the referenced geometry or annotation data.
 *     tags:
 *       - Annotation Links
 *     security:
 *       - sessionCookie: []
 *       - sessionBearer: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: linkId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedVersion]
 *             properties:
 *               expectedVersion:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Annotation link restored
 *       400:
 *         description: Missing expectedVersion or invalid transition result
 *       404:
 *         description: Annotation link not found
 *       409:
 *         description: Link already non-erasable or version conflict
 */
router.patch('/:projectId/annotations/links/:linkId/nonerasable', requireAuth, markAnnotationLinkNonErasableHandler);

export default router;