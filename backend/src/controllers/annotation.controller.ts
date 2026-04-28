import type { Request, Response } from 'express';
import { RoleEnum } from '@prisma/client';
import { getPrismaClient } from '../../db.js';
import { sendApiError } from '../lib/api-error.js';
import type { ApiErrorPayload } from '../lib/api-error.js';
import {
  publishAnnotationMutation,
  publishAnnotationSocialLockStart,
  publishAnnotationSocialLockStop,
  subscribeToAnnotationEvents,
} from '../lib/annotation-events.js';
import type { User } from '../types/index.js';
import type { AnnotationMutationEvent, AnnotationSocialLockRequest } from 'shared/annotation-events';
import {
  createAnnotationData,
  createAnnotationGeometry,
  createAnnotationLink,
  getAnnotationDataList,
  getAnnotationGeometries,
  getAnnotations,
  getAnnotationData,
  getAnnotationDataForSceneAssets,
  getAnnotationGeometry,
  getAnnotationGeometriesForSceneAssets,
  getAnnotationLink,
  getAnnotationLinksForProject,
  getAnnotationLinksForSceneAssets,
  markAnnotationDataErasable,
  markAnnotationDataNonErasable,
  markAnnotationGeometryErasable,
  markAnnotationGeometryNonErasable,
  markAnnotationLinkErasable,
  markAnnotationLinkNonErasable,
  resolveAnnotationImpactForLink,
  resolveAnnotationImpactForScope,
  updateAnnotationData,
  updateAnnotationGeometryShapes,
} from '../services/annotation.service.js';
import { annotationShapeSchema, annotationScopeTypeSchema } from 'shared/annotation-schema';
import type { AnnotationShape } from 'shared/annotation-types';

function getCurrentUser(req: Request): User | null {
  if (process.env.NODE_ENV === 'test' && req.user) {
    return req.user;
  }

  return req.user || null;
}

function parseBooleanQuery(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }

  return value === 'true' || value === '1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function userHasProjectAccess(userId: string, projectId: string, allowedRoles: RoleEnum[]) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (user.sys_admin) return true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { public: true },
  });
  if (project?.public) {
    return true;
  }

  const role = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId,
      role: { in: allowedRoles },
    },
  });

  return !!role;
}

async function requireProjectRole(
  req: Request,
  res: Response,
  projectId: string,
  allowedRoles: RoleEnum[],
) {
  const currentUser = getCurrentUser(req);
  if (!currentUser?.sub) {
    sendApiError(req, res, {
      status: 401,
      code: 'common.authentication_required',
      error: 'Authentication required',
    });
    return null;
  }

  if (!currentUser.id) {
    sendApiError(req, res, {
      status: 401,
      code: 'common.authentication_required',
      error: 'Authentication required',
    });
    return null;
  }

  const allowed = await userHasProjectAccess(currentUser.id, projectId, allowedRoles);
  if (!allowed) {
    sendApiError(req, res, {
      status: 403,
      code: 'common.access_denied',
      error: 'Access denied',
    });
    return null;
  }

  return currentUser;
}

function parseExpectedVersion(body: unknown) {
  if (!isRecord(body) || typeof body.expectedVersion !== 'number' || !Number.isInteger(body.expectedVersion)) {
    return null;
  }

  return body.expectedVersion;
}

function parseShapes(body: unknown): AnnotationShape[] | null {
  if (!isRecord(body) || !Array.isArray(body.shapes) || body.shapes.length === 0) {
    return null;
  }

  const shapes = body.shapes
    .map((shape) => annotationShapeSchema.safeParse(shape))
    .filter((result): result is { success: true; data: AnnotationShape } => result.success)
    .map((result) => result.data);

  return shapes.length === body.shapes.length ? shapes : null;
}

function sendMappedError(
  req: Request,
  res: Response,
  failure: { code: string },
  mappings: Record<string, ApiErrorPayload>,
) {
  const mapped: ApiErrorPayload = mappings[failure.code] ?? {
    status: 500,
    error: 'Unhandled annotation service error',
    code: 'annotation.unhandled_service_error',
  };
  sendApiError(req, res, mapped);
}

function getActorUsername(user: User) {
  return user.username || user.email || user.sub || user.id || 'unknown-user';
}

async function buildMutationImpact(
  projectId: string,
  entity: AnnotationMutationEvent['entity'],
) {
  if (
    (entity.kind === 'geometry' || entity.kind === 'data')
    && (entity.referenceType === 'scene' || entity.referenceType === 'asset')
    && typeof entity.referenceId === 'string'
  ) {
    return resolveAnnotationImpactForScope(projectId, entity.referenceType, entity.referenceId);
  }

  if (entity.kind === 'link' && typeof entity.geometryId === 'string' && typeof entity.dataId === 'string') {
    return resolveAnnotationImpactForLink(projectId, entity.geometryId, entity.dataId);
  }

  return null;
}

async function publishMutationIfPossible(
  req: Request,
  currentUser: User,
  event: Omit<AnnotationMutationEvent, 'sessionId' | 'userId' | 'username' | 'timestamp' | 'impact' | 'sceneId'>,
) {
  if (!req.sessionId || !currentUser.id) {
    return;
  }

  const impact = await buildMutationImpact(event.projectId, event.entity);
  if (!impact) {
    return;
  }

  publishAnnotationMutation({
    ...event,
    sceneId: impact.originScopeType === 'scene' ? impact.originScopeId : null,
    impact,
    timestamp: new Date().toISOString(),
    sessionId: req.sessionId,
    userId: currentUser.id,
    username: getActorUsername(currentUser),
  });
}

function parseSocialLockPayload(body: unknown) {
  if (!isRecord(body)) {
    return null;
  }

  const streamId = typeof body.streamId === 'string' ? body.streamId : null;
  const legacySceneId = typeof body.sceneId === 'string' ? body.sceneId : null;
  const originScopeType =
    body.originScopeType === 'scene' || body.originScopeType === 'asset'
      ? body.originScopeType
      : legacySceneId
        ? 'scene'
        : null;
  const originScopeId = typeof body.originScopeId === 'string' ? body.originScopeId : legacySceneId;
  const resourceType =
    body.resourceType === 'geometry' || body.resourceType === 'data' || body.resourceType === 'link'
      ? body.resourceType
      : undefined;
  const resourceId = typeof body.resourceId === 'string' ? body.resourceId : undefined;
  const activity = typeof body.activity === 'string' ? body.activity : undefined;

  if (!streamId || !originScopeType || !originScopeId) {
    return null;
  }

  if ((resourceType && !resourceId) || (!resourceType && resourceId)) {
    return null;
  }

  return {
    streamId,
    originScopeType,
    originScopeId,
    resourceType,
    resourceId,
    activity,
  } satisfies AnnotationSocialLockRequest;
}

export async function subscribeAnnotationEventsHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const sceneId = typeof req.query.sceneId === 'string' ? req.query.sceneId : null;
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser?.id || !req.sessionId) return;

    const subscription = subscribeToAnnotationEvents({
      projectId,
      sceneId,
      sessionId: req.sessionId,
      userId: currentUser.id,
      username: getActorUsername(currentUser),
      response: res,
    });

    let closed = false;
    const cleanup = () => {
      if (closed) {
        return;
      }

      closed = true;
      subscription.close();
    };

    req.on('close', cleanup);
    req.on('aborted', cleanup);
  } catch (error: any) {
    console.error('Failed to subscribe to annotation events:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to subscribe to annotation events', message: error?.message });
    }
  }
}

export async function notifyAnnotationSocialLockStartHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id || !req.sessionId) return;

    const payload = parseSocialLockPayload(req.body);
    if (!payload) {
      res.status(400).json({ error: 'streamId and a valid origin scope are required; resourceType/resourceId must be paired' });
      return;
    }

    const impact = await resolveAnnotationImpactForScope(projectId, payload.originScopeType!, payload.originScopeId!);
    if (!impact) {
      res.status(404).json({ error: 'Referenced scene or asset not found' });
      return;
    }

    const result = publishAnnotationSocialLockStart({
      projectId,
      sceneId: impact.originScopeType === 'scene' ? impact.originScopeId : null,
      streamId: payload.streamId,
      sessionId: req.sessionId,
      userId: currentUser.id,
      username: getActorUsername(currentUser),
      resourceType: payload.resourceType ?? null,
      resourceId: payload.resourceId ?? null,
      activity: payload.activity ?? null,
      impact,
    });
    if (!result.ok) {
      const status = result.code === 'stream_not_found' ? 404 : 409;
      res.status(status).json({ error: 'Annotation event stream is not available', code: result.code });
      return;
    }

    res.status(202).json({ success: true, event: result.value });
  } catch (error: any) {
    console.error('Failed to publish social lock start:', error);
    res.status(500).json({ error: 'Failed to publish social lock start', message: error?.message });
  }
}

export async function notifyAnnotationSocialLockStopHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id || !req.sessionId) return;

    const payload = parseSocialLockPayload(req.body);
    if (!payload) {
      res.status(400).json({ error: 'streamId and a valid origin scope are required; resourceType/resourceId must be paired' });
      return;
    }

    const impact = await resolveAnnotationImpactForScope(projectId, payload.originScopeType!, payload.originScopeId!);
    if (!impact) {
      res.status(404).json({ error: 'Referenced scene or asset not found' });
      return;
    }

    const result = publishAnnotationSocialLockStop({
      projectId,
      sceneId: impact.originScopeType === 'scene' ? impact.originScopeId : null,
      streamId: payload.streamId,
      sessionId: req.sessionId,
      userId: currentUser.id,
      username: getActorUsername(currentUser),
      resourceType: payload.resourceType ?? null,
      resourceId: payload.resourceId ?? null,
      activity: payload.activity ?? null,
      impact,
    });
    if (!result.ok) {
      const status = result.code === 'stream_not_found' ? 404 : 409;
      res.status(status).json({ error: 'Annotation social lock is not available', code: result.code });
      return;
    }

    res.status(202).json({ success: true, event: result.value });
  } catch (error: any) {
    console.error('Failed to publish social lock stop:', error);
    res.status(500).json({ error: 'Failed to publish social lock stop', message: error?.message });
  }
}

export async function getAnnotationsHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const sceneId = typeof req.query.sceneId === 'string' ? req.query.sceneId : undefined;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const result = await getAnnotations(projectId, sceneId, includeErasable);
    if (!result.ok) {
      sendMappedError(req, res, result, {
        invalid_input: { status: 400, code: 'annotation.scene.invalid_input', error: 'Invalid scene id' },
        scene_not_found: { status: 404, code: 'annotation.scene.not_found', error: 'Scene not found' },
      });
      return;
    }

    res.json({ success: true, ...result.value });
  } catch (error: any) {
    console.error('Failed to get annotations:', error);
    res.status(500).json({ error: 'Failed to get annotations', message: error?.message });
  }
}

export async function getAnnotationGeometriesForSceneHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const sceneId = typeof req.query.sceneId === 'string' ? req.query.sceneId : undefined;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const geometries = await getAnnotationGeometries(projectId, sceneId, includeErasable);
    if (!geometries.ok) {
      sendMappedError(req, res, geometries, {
        invalid_input: { status: 400, code: 'annotation.scene.invalid_input', error: 'Invalid scene id' },
        scene_not_found: { status: 404, code: 'annotation.scene.not_found', error: 'Scene not found' },
      });
      return;
    }

    res.json({ success: true, geometries: geometries.value });
  } catch (error: any) {
    console.error('Failed to get geometries for scene:', error);
    res.status(500).json({ error: 'Failed to get geometries for scene', message: error?.message });
  }
}

export async function getAnnotationGeometryHandler(req: Request, res: Response) {
  try {
    const { projectId, geometryId } = req.params;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const geometry = await getAnnotationGeometry(projectId, geometryId, includeErasable);
    if (!geometry) {
      sendApiError(req, res, {
        status: 404,
        code: 'annotation.geometry.not_found',
        error: 'Annotation geometry not found',
      });
      return;
    }

    res.json({ success: true, geometry });
  } catch (error: any) {
    console.error('Failed to get geometry:', error);
    res.status(500).json({ error: 'Failed to get geometry', message: error?.message });
  }
}

export async function createAnnotationGeometryHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const shapes = parseShapes(req.body);
    const referenceTypeResult = annotationScopeTypeSchema.safeParse(req.body?.referenceType);
    const referenceId = typeof req.body?.referenceId === 'string' ? req.body.referenceId : null;
    if (!shapes || !referenceTypeResult.success || !referenceId) {
      res.status(400).json({ error: 'Invalid geometry payload' });
      return;
    }

    const createResult = await createAnnotationGeometry(
      projectId,
      shapes,
      referenceTypeResult.data,
      referenceId,
      currentUser.id,
    );
    if (!createResult.ok) {
      sendMappedError(req, res, createResult, {
        invalid_input: { status: 400, code: 'annotation.geometry.invalid_input', error: 'Invalid geometry payload' },
        reference_not_found: { status: 404, code: 'annotation.geometry.reference_not_found', error: 'Referenced scene or asset not found' },
        invalid_geometry_document: { status: 400, code: 'annotation.geometry.invalid_document', error: 'Geometry payload is semantically invalid' },
        duplicate_geometry: { status: 409, code: 'annotation.geometry.duplicate', error: 'Generated geometry id already exists' },
      });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, createResult.value, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'geometry.created',
      entity: {
        kind: 'geometry',
        id: createResult.value,
        version: geometry?.version ?? null,
        referenceType: geometry?.referenceType ?? referenceTypeResult.data,
        referenceId: geometry?.referenceId ?? referenceId,
        erasable: geometry ? geometry.erasableAt !== null : null,
      },
    });
    res.status(201).json({ success: true, geometry });
  } catch (error: any) {
    console.error('Failed to create geometry:', error);
    res.status(500).json({ error: 'Failed to create geometry', message: error?.message });
  }
}

export async function updateAnnotationGeometryHandler(req: Request, res: Response) {
  try {
    const { projectId, geometryId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const expectedVersion = parseExpectedVersion(req.body);
    const shapes = parseShapes(req.body);
    if (expectedVersion === null || !shapes) {
      res.status(400).json({ error: 'Invalid geometry update payload' });
      return;
    }

    const updateResult = await updateAnnotationGeometryShapes(projectId, geometryId, expectedVersion, shapes, currentUser.id);
    if (!updateResult.ok) {
      sendMappedError(req, res, updateResult, {
        invalid_input: { status: 400, code: 'annotation.geometry.invalid_input', error: 'Invalid geometry update payload' },
        geometry_not_found: { status: 404, code: 'annotation.geometry.not_found', error: 'Annotation geometry not found' },
        version_conflict: { status: 409, code: 'annotation.geometry.version_conflict', error: 'Geometry version conflict' },
        invalid_geometry_document: { status: 400, code: 'annotation.geometry.invalid_document', error: 'Updated geometry is semantically invalid' },
      });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'geometry.updated',
      entity: {
        kind: 'geometry',
        id: geometryId,
        version: updateResult.value,
        referenceType: geometry?.referenceType ?? null,
        referenceId: geometry?.referenceId ?? null,
        erasable: geometry ? geometry.erasableAt !== null : null,
      },
    });
    res.json({ success: true, version: updateResult.value, updatedAt: geometry?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to update geometry:', error);
    res.status(500).json({ error: 'Failed to update geometry', message: error?.message });
  }
}

export async function markAnnotationGeometryErasableHandler(req: Request, res: Response) {
  try {
    const { projectId, geometryId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const expectedVersion = parseExpectedVersion(req.body);
    if (expectedVersion === null) {
      res.status(400).json({ error: 'expectedVersion is required' });
      return;
    }

    const transitionResult = await markAnnotationGeometryErasable(projectId, geometryId, expectedVersion, currentUser.id);
    if (!transitionResult.ok) {
      sendMappedError(req, res, transitionResult, {
        invalid_input: { status: 400, code: 'annotation.geometry.invalid_input', error: 'expectedVersion is required' },
        geometry_not_found: { status: 404, code: 'annotation.geometry.not_found', error: 'Annotation geometry not found' },
        already_erasable: { status: 409, code: 'annotation.geometry.already_erasable', error: 'Annotation geometry is already erasable' },
        version_conflict: { status: 409, code: 'annotation.geometry.version_conflict', error: 'Geometry version conflict' },
        invalid_geometry_document: { status: 400, code: 'annotation.geometry.invalid_document', error: 'Geometry erasable transition produced an invalid document' },
      });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'geometry.erasable',
      entity: {
        kind: 'geometry',
        id: geometryId,
        version: transitionResult.value,
        referenceType: geometry?.referenceType ?? null,
        referenceId: geometry?.referenceId ?? null,
        erasable: true,
      },
    });
    res.json({ success: true, version: transitionResult.value, updatedAt: geometry?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to mark geometry erasable:', error);
    res.status(500).json({ error: 'Failed to mark geometry erasable', message: error?.message });
  }
}

export async function markAnnotationGeometryNonErasableHandler(req: Request, res: Response) {
  try {
    const { projectId, geometryId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const expectedVersion = parseExpectedVersion(req.body);
    if (expectedVersion === null) {
      res.status(400).json({ error: 'expectedVersion is required' });
      return;
    }

    const restoreResult = await markAnnotationGeometryNonErasable(projectId, geometryId, expectedVersion, currentUser.id);
    if (!restoreResult.ok) {
      sendMappedError(req, res, restoreResult, {
        invalid_input: { status: 400, code: 'annotation.geometry.invalid_input', error: 'expectedVersion is required' },
        geometry_not_found: { status: 404, code: 'annotation.geometry.not_found', error: 'Annotation geometry not found' },
        already_non_erasable: { status: 409, code: 'annotation.geometry.already_non_erasable', error: 'Annotation geometry is already non-erasable' },
        version_conflict: { status: 409, code: 'annotation.geometry.version_conflict', error: 'Geometry version conflict' },
        invalid_geometry_document: { status: 400, code: 'annotation.geometry.invalid_document', error: 'Geometry restore produced an invalid document' },
      });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'geometry.restored',
      entity: {
        kind: 'geometry',
        id: geometryId,
        version: restoreResult.value,
        referenceType: geometry?.referenceType ?? null,
        referenceId: geometry?.referenceId ?? null,
        erasable: false,
      },
    });
    res.json({ success: true, version: restoreResult.value, updatedAt: geometry?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to restore geometry:', error);
    res.status(500).json({ error: 'Failed to restore geometry', message: error?.message });
  }
}

export async function getAnnotationDataForSceneHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const sceneId = typeof req.query.sceneId === 'string' ? req.query.sceneId : undefined;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const data = await getAnnotationDataList(projectId, sceneId, includeErasable);
    if (!data.ok) {
      sendMappedError(req, res, data, {
        invalid_input: { status: 400, code: 'annotation.scene.invalid_input', error: 'Invalid scene id' },
        scene_not_found: { status: 404, code: 'annotation.scene.not_found', error: 'Scene not found' },
      });
      return;
    }

    res.json({ success: true, data: data.value });
  } catch (error: any) {
    console.error('Failed to get data for scene:', error);
    res.status(500).json({ error: 'Failed to get data for scene', message: error?.message });
  }
}

export async function getAnnotationDataHandler(req: Request, res: Response) {
  try {
    const { projectId, dataId } = req.params;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const datum = await getAnnotationData(projectId, dataId, includeErasable);
    if (!datum) {
      sendApiError(req, res, {
        status: 404,
        code: 'annotation.data.not_found',
        error: 'Annotation data not found',
      });
      return;
    }

    res.json({ success: true, datum });
  } catch (error: any) {
    console.error('Failed to get annotation data:', error);
    res.status(500).json({ error: 'Failed to get annotation data', message: error?.message });
  }
}

export async function createAnnotationDataHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const label = typeof req.body?.label === 'string' ? req.body.label : null;
    const description = typeof req.body?.description === 'string' ? req.body.description : '';
    const annotationClass = req.body?.class === null || typeof req.body?.class === 'string' ? req.body.class : undefined;
    const content = isRecord(req.body?.content) ? req.body.content : null;
    const visibilityTypeResult = annotationScopeTypeSchema.safeParse(req.body?.visibilityType);
    const visibilityId = typeof req.body?.visibilityId === 'string' ? req.body.visibilityId : null;
    if (!label || annotationClass === undefined || !content || !visibilityTypeResult.success || !visibilityId) {
      res.status(400).json({ error: 'Invalid annotation data payload' });
      return;
    }

    const createResult = await createAnnotationData(
      projectId,
      label,
      description,
      annotationClass,
      content,
      visibilityTypeResult.data,
      visibilityId,
      currentUser.id,
    );
    if (!createResult.ok) {
      sendMappedError(req, res, createResult, {
        invalid_input: { status: 400, code: 'annotation.data.invalid_input', error: 'Invalid annotation data payload' },
        reference_not_found: { status: 404, code: 'annotation.data.reference_not_found', error: 'Referenced scene or asset not found' },
        invalid_data_document: { status: 400, code: 'annotation.data.invalid_document', error: 'Annotation data payload is semantically invalid' },
        duplicate_data: { status: 409, code: 'annotation.data.duplicate', error: 'Generated annotation data id already exists' },
      });
      return;
    }

    const datum = await getAnnotationData(projectId, createResult.value, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'data.created',
      entity: {
        kind: 'data',
        id: createResult.value,
        version: datum?.version ?? null,
        referenceType: datum?.visibilityType ?? visibilityTypeResult.data,
        referenceId: datum?.visibilityId ?? visibilityId,
        erasable: datum ? datum.erasableAt !== null : null,
      },
    });
    res.status(201).json({ success: true, datum });
  } catch (error: any) {
    console.error('Failed to create annotation data:', error);
    res.status(500).json({ error: 'Failed to create annotation data', message: error?.message });
  }
}

export async function updateAnnotationDataHandler(req: Request, res: Response) {
  try {
    const { projectId, dataId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const expectedVersion = parseExpectedVersion(req.body);
    if (expectedVersion === null) {
      res.status(400).json({ error: 'expectedVersion is required' });
      return;
    }

    if (req.body?.visibilityType !== undefined || req.body?.visibilityId !== undefined) {
      res.status(400).json({ error: 'visibilityType and visibilityId are immutable' });
      return;
    }

    const updates = {
      label: typeof req.body?.label === 'string' ? req.body.label : undefined,
      description: typeof req.body?.description === 'string' ? req.body.description : undefined,
      class: req.body?.class === null || typeof req.body?.class === 'string' ? req.body.class : undefined,
      content: isRecord(req.body?.content) ? req.body.content : undefined,
    };
    if (Object.values(updates).every((value) => value === undefined)) {
      res.status(400).json({ error: 'No mutable fields provided' });
      return;
    }

    const updateResult = await updateAnnotationData(projectId, dataId, expectedVersion, updates, currentUser.id);
    if (!updateResult.ok) {
      sendMappedError(req, res, updateResult, {
        invalid_input: { status: 400, code: 'annotation.data.invalid_input', error: 'Invalid annotation data payload' },
        data_not_found: { status: 404, code: 'annotation.data.not_found', error: 'Annotation data not found' },
        no_mutable_fields: { status: 400, code: 'annotation.data.invalid_input', error: 'No mutable fields provided' },
        version_conflict: { status: 409, code: 'annotation.data.version_conflict', error: 'Annotation data version conflict' },
        invalid_data_document: { status: 400, code: 'annotation.data.invalid_document', error: 'Updated annotation data is semantically invalid' },
      });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'data.updated',
      entity: {
        kind: 'data',
        id: dataId,
        version: updateResult.value,
        referenceType: datum?.visibilityType ?? null,
        referenceId: datum?.visibilityId ?? null,
        erasable: datum ? datum.erasableAt !== null : null,
      },
    });
    res.json({ success: true, version: updateResult.value, updatedAt: datum?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to update annotation data:', error);
    res.status(500).json({ error: 'Failed to update annotation data', message: error?.message });
  }
}

export async function markAnnotationDataErasableHandler(req: Request, res: Response) {
  try {
    const { projectId, dataId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const expectedVersion = parseExpectedVersion(req.body);
    if (expectedVersion === null) {
      res.status(400).json({ error: 'expectedVersion is required' });
      return;
    }

    const transitionResult = await markAnnotationDataErasable(projectId, dataId, expectedVersion, currentUser.id);
    if (!transitionResult.ok) {
      sendMappedError(req, res, transitionResult, {
        invalid_input: { status: 400, code: 'annotation.data.invalid_input', error: 'expectedVersion is required' },
        data_not_found: { status: 404, code: 'annotation.data.not_found', error: 'Annotation data not found' },
        already_erasable: { status: 409, code: 'annotation.data.already_erasable', error: 'Annotation data is already erasable' },
        version_conflict: { status: 409, code: 'annotation.data.version_conflict', error: 'Annotation data version conflict' },
        invalid_data_document: { status: 400, code: 'annotation.data.invalid_document', error: 'Annotation data erasable transition produced an invalid document' },
      });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'data.erasable',
      entity: {
        kind: 'data',
        id: dataId,
        version: transitionResult.value,
        referenceType: datum?.visibilityType ?? null,
        referenceId: datum?.visibilityId ?? null,
        erasable: true,
      },
    });
    res.json({ success: true, version: transitionResult.value, updatedAt: datum?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to mark annotation data erasable:', error);
    res.status(500).json({ error: 'Failed to mark annotation data erasable', message: error?.message });
  }
}

export async function markAnnotationDataNonErasableHandler(req: Request, res: Response) {
  try {
    const { projectId, dataId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const expectedVersion = parseExpectedVersion(req.body);
    if (expectedVersion === null) {
      res.status(400).json({ error: 'expectedVersion is required' });
      return;
    }

    const restoreResult = await markAnnotationDataNonErasable(projectId, dataId, expectedVersion, currentUser.id);
    if (!restoreResult.ok) {
      sendMappedError(req, res, restoreResult, {
        invalid_input: { status: 400, code: 'annotation.data.invalid_input', error: 'expectedVersion is required' },
        data_not_found: { status: 404, code: 'annotation.data.not_found', error: 'Annotation data not found' },
        already_non_erasable: { status: 409, code: 'annotation.data.already_non_erasable', error: 'Annotation data is already non-erasable' },
        version_conflict: { status: 409, code: 'annotation.data.version_conflict', error: 'Annotation data version conflict' },
        invalid_data_document: { status: 400, code: 'annotation.data.invalid_document', error: 'Annotation data restore produced an invalid document' },
      });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'data.restored',
      entity: {
        kind: 'data',
        id: dataId,
        version: restoreResult.value,
        referenceType: datum?.visibilityType ?? null,
        referenceId: datum?.visibilityId ?? null,
        erasable: false,
      },
    });
    res.json({ success: true, version: restoreResult.value, updatedAt: datum?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to restore annotation data:', error);
    res.status(500).json({ error: 'Failed to restore annotation data', message: error?.message });
  }
}

export async function getAnnotationLinksHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const sceneId = typeof req.query.sceneId === 'string' ? req.query.sceneId : undefined;
    const geometryId = typeof req.query.geometryId === 'string' ? req.query.geometryId : undefined;
    const dataId = typeof req.query.dataId === 'string' ? req.query.dataId : undefined;
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const links = sceneId
      ? await getAnnotationLinksForSceneAssets(projectId, sceneId, includeErasable)
      : await Promise.resolve({ ok: true as const, value: await getAnnotationLinksForProject(projectId, includeErasable, { geometryId, dataId }) });
    if (!links.ok) {
      sendMappedError(req, res, links, {
        invalid_input: { status: 400, code: 'annotation.scene.invalid_input', error: 'Invalid scene id' },
        scene_not_found: { status: 404, code: 'annotation.scene.not_found', error: 'Scene not found' },
      });
      return;
    }

    const filteredLinks = links.value.filter((link) => {
      if (geometryId && link.geometryId !== geometryId) {
        return false;
      }

      if (dataId && link.dataId !== dataId) {
        return false;
      }

      return true;
    });
    res.json({ success: true, links: filteredLinks });
  } catch (error: any) {
    console.error('Failed to get annotation links:', error);
    res.status(500).json({ error: 'Failed to get annotation links', message: error?.message });
  }
}

export async function getAnnotationLinksForSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const links = await getAnnotationLinksForSceneAssets(projectId, sceneId, includeErasable);
    if (!links.ok) {
      sendMappedError(req, res, links, {
        invalid_input: { status: 400, code: 'annotation.scene.invalid_input', error: 'Invalid scene id' },
        scene_not_found: { status: 404, code: 'annotation.scene.not_found', error: 'Scene not found' },
      });
      return;
    }

    res.json({ success: true, links: links.value });
  } catch (error: any) {
    console.error('Failed to get links for scene:', error);
    res.status(500).json({ error: 'Failed to get links for scene', message: error?.message });
  }
}

export async function getAnnotationLinkHandler(req: Request, res: Response) {
  try {
    const { projectId, linkId } = req.params;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const link = await getAnnotationLink(projectId, linkId, includeErasable);
    if (!link) {
      sendApiError(req, res, {
        status: 404,
        code: 'annotation.link.not_found',
        error: 'Annotation link not found',
      });
      return;
    }

    res.json({ success: true, link });
  } catch (error: any) {
    console.error('Failed to get annotation link:', error);
    res.status(500).json({ error: 'Failed to get annotation link', message: error?.message });
  }
}

export async function createAnnotationLinkHandler(req: Request, res: Response) {
  try {
    const { projectId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const geometryId = typeof req.body?.geometryId === 'string' ? req.body.geometryId : null;
    const dataId = typeof req.body?.dataId === 'string' ? req.body.dataId : null;
    if (!geometryId || !dataId) {
      res.status(400).json({ error: 'geometryId and dataId are required' });
      return;
    }

    const createResult = await createAnnotationLink(projectId, geometryId, dataId, currentUser.id);
    if (!createResult.ok) {
      sendMappedError(req, res, createResult, {
        invalid_input: { status: 400, code: 'annotation.link.invalid_input', error: 'geometryId and dataId are required' },
        project_context_not_available: { status: 409, code: 'annotation.link.project_context_unavailable', error: 'Project annotation context is not available' },
        geometry_not_found: { status: 404, code: 'annotation.geometry.not_found', error: 'Referenced geometry not found' },
        data_not_found: { status: 404, code: 'annotation.data.not_found', error: 'Referenced annotation data not found' },
        duplicate_link_pair: { status: 409, code: 'annotation.link.duplicate_pair', error: 'Link pair already exists' },
        scope_incompatible: { status: 409, code: 'annotation.link.scope_incompatible', error: 'Geometry and annotation data scopes are incompatible' },
        invalid_link_document: { status: 400, code: 'annotation.link.invalid_document', error: 'Annotation link payload is semantically invalid' },
      });
      return;
    }

    const link = await getAnnotationLink(projectId, createResult.value, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'link.created',
      entity: {
        kind: 'link',
        id: createResult.value,
        version: link?.version ?? null,
        geometryId: link?.geometryId ?? geometryId,
        dataId: link?.dataId ?? dataId,
        erasable: link ? link.erasableAt !== null : null,
      },
    });
    res.status(201).json({ success: true, link });
  } catch (error: any) {
    console.error('Failed to create annotation link:', error);
    res.status(500).json({ error: 'Failed to create annotation link', message: error?.message });
  }
}

export async function markAnnotationLinkErasableHandler(req: Request, res: Response) {
  try {
    const { projectId, linkId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const expectedVersion = parseExpectedVersion(req.body);
    if (expectedVersion === null) {
      res.status(400).json({ error: 'expectedVersion is required' });
      return;
    }

    const transitionResult = await markAnnotationLinkErasable(projectId, linkId, expectedVersion, currentUser.id);
    if (!transitionResult.ok) {
      sendMappedError(req, res, transitionResult, {
        invalid_input: { status: 400, code: 'annotation.link.invalid_input', error: 'expectedVersion is required' },
        link_not_found: { status: 404, code: 'annotation.link.not_found', error: 'Annotation link not found' },
        already_erasable: { status: 409, code: 'annotation.link.already_erasable', error: 'Annotation link is already erasable' },
        version_conflict: { status: 409, code: 'annotation.link.version_conflict', error: 'Annotation link version conflict' },
        invalid_link_document: { status: 400, code: 'annotation.link.invalid_document', error: 'Annotation link erasable transition produced an invalid document' },
      });
      return;
    }

    const link = await getAnnotationLink(projectId, linkId, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'link.erasable',
      entity: {
        kind: 'link',
        id: linkId,
        version: transitionResult.value,
        geometryId: link?.geometryId ?? null,
        dataId: link?.dataId ?? null,
        erasable: true,
      },
    });
    res.json({ success: true, version: transitionResult.value, updatedAt: link?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to mark annotation link erasable:', error);
    res.status(500).json({ error: 'Failed to mark annotation link erasable', message: error?.message });
  }
}

export async function markAnnotationLinkNonErasableHandler(req: Request, res: Response) {
  try {
    const { projectId, linkId } = req.params;
    const currentUser = await requireProjectRole(req, res, projectId, [RoleEnum.editor, RoleEnum.manager]);
    if (!currentUser?.id) return;

    const expectedVersion = parseExpectedVersion(req.body);
    if (expectedVersion === null) {
      res.status(400).json({ error: 'expectedVersion is required' });
      return;
    }

    const transitionResult = await markAnnotationLinkNonErasable(projectId, linkId, expectedVersion, currentUser.id);
    if (!transitionResult.ok) {
      sendMappedError(req, res, transitionResult, {
        invalid_input: { status: 400, code: 'annotation.link.invalid_input', error: 'expectedVersion is required' },
        link_not_found: { status: 404, code: 'annotation.link.not_found', error: 'Annotation link not found' },
        already_non_erasable: { status: 409, code: 'annotation.link.already_non_erasable', error: 'Annotation link is already non-erasable' },
        version_conflict: { status: 409, code: 'annotation.link.version_conflict', error: 'Annotation link version conflict' },
        invalid_link_document: { status: 400, code: 'annotation.link.invalid_document', error: 'Annotation link restore produced an invalid document' },
      });
      return;
    }

    const link = await getAnnotationLink(projectId, linkId, true);
    await publishMutationIfPossible(req, currentUser, {
      type: 'annotation.mutated',
      projectId,
      mutation: 'link.restored',
      entity: {
        kind: 'link',
        id: linkId,
        version: transitionResult.value,
        geometryId: link?.geometryId ?? null,
        dataId: link?.dataId ?? null,
        erasable: false,
      },
    });
    res.json({ success: true, version: transitionResult.value, updatedAt: link?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to restore annotation link:', error);
    res.status(500).json({ error: 'Failed to restore annotation link', message: error?.message });
  }
}