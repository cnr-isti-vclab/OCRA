import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createAnnotationDataHandler,
  createAnnotationGeometryHandler,
  createAnnotationLinkHandler,
  getAnnotationsForSceneHandler,
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
  updateAnnotationDataHandler,
  updateAnnotationGeometryHandler,
} from '../controllers/annotation.controller.js';

const router = Router();

/**
 * @openapi
 * /api/projects/{projectId}/annotations/for-scene/{sceneId}:
 *   get:
 *     summary: Load all annotations for a scene
 *     description: Returns geometries, data records, and links visible in the given scene in one round-trip.
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
 *       - in: path
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *         description: Include erasable entities and links in the response.
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
 */
router.get('/:projectId/annotations/for-scene/:sceneId', requireAuth, getAnnotationsForSceneHandler);

/**
 * @openapi
 * /api/projects/{projectId}/annotations/geometry/for-scene/{sceneId}:
 *   get:
 *     summary: Get annotation geometries visible in a scene
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
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
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
 */
router.get('/:projectId/annotations/geometry/for-scene/:sceneId', requireAuth, getAnnotationGeometriesForSceneHandler);
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
 *         description: Invalid geometry update payload
 *       404:
 *         description: Annotation geometry not found
 *       409:
 *         description: OCC conflict
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
 *       404:
 *         description: Annotation geometry not found
 *       409:
 *         description: OCC conflict
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
 *       404:
 *         description: Annotation geometry not found
 *       409:
 *         description: OCC conflict
 */
router.patch('/:projectId/annotations/geometry/:geometryId/nonerasable', requireAuth, markAnnotationGeometryNonErasableHandler);

/**
 * @openapi
 * /api/projects/{projectId}/annotations/data/for-scene/{sceneId}:
 *   get:
 *     summary: Get annotation data visible in a scene
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
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Data visible in the scene
 */
router.get('/:projectId/annotations/data/for-scene/:sceneId', requireAuth, getAnnotationDataForSceneHandler);
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
 *         description: Invalid annotation data payload
 *       404:
 *         description: Referenced scene or asset not found
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
 *         description: Invalid payload or immutable fields included
 *       404:
 *         description: Annotation data not found
 *       409:
 *         description: OCC conflict
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
 *       404:
 *         description: Annotation data not found
 *       409:
 *         description: OCC conflict
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
 *       404:
 *         description: Annotation data not found
 *       409:
 *         description: OCC conflict
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
 * /api/projects/{projectId}/annotations/links/for-scene/{sceneId}:
 *   get:
 *     summary: Get annotation links visible in a scene
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
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: includeErasable
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Links visible in the scene
 */
router.get('/:projectId/annotations/links/for-scene/:sceneId', requireAuth, getAnnotationLinksForSceneHandler);
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
 *         description: Referenced geometry or data not found
 *       409:
 *         description: Duplicate pair or scope consistency violation
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
 *       404:
 *         description: Annotation link not found
 *       409:
 *         description: OCC conflict
 */
router.patch('/:projectId/annotations/links/:linkId/erasable', requireAuth, markAnnotationLinkErasableHandler);
/**
 * @openapi
 * /api/projects/{projectId}/annotations/links/{linkId}/nonerasable:
 *   patch:
 *     summary: Restore an annotation link and its referenced entities
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
 *       404:
 *         description: Annotation link not found
 *       409:
 *         description: OCC conflict
 */
router.patch('/:projectId/annotations/links/:linkId/nonerasable', requireAuth, markAnnotationLinkNonErasableHandler);

export default router;