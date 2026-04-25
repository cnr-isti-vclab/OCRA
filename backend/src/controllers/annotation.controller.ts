import type { Request, Response } from 'express';
import { RoleEnum } from '@prisma/client';
import { getPrismaClient } from '../../db.js';
import type { User } from '../types/index.js';
import {
  createAnnotationData,
  createAnnotationGeometry,
  createAnnotationLink,
  getAnnotationsForScene,
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

async function userHasProjectRole(userSub: string, projectId: string, allowedRoles: RoleEnum[]) {
  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({ where: { sub: userSub } });
  if (!user) return false;
  if (user.sys_admin) return true;

  const role = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId: user.id,
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
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const allowed = await userHasProjectRole(currentUser.sub, projectId, allowedRoles);
  if (!allowed) {
    res.status(403).json({ error: 'Access denied' });
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
  res: Response,
  failure: { code: string },
  mappings: Record<string, { status: number; error: string }>,
) {
  const mapped = mappings[failure.code] ?? { status: 500, error: 'Unhandled annotation service error' };
  res.status(mapped.status).json({ error: mapped.error });
}

export async function getAnnotationsForSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const result = await getAnnotationsForScene(projectId, sceneId, includeErasable);
    if (!result.ok) {
      sendMappedError(res, result, {
        invalid_input: { status: 400, error: 'Invalid scene id' },
        scene_not_found: { status: 404, error: 'Scene not found' },
      });
      return;
    }

    res.json({ success: true, ...result.value });
  } catch (error: any) {
    console.error('Failed to get annotations for scene:', error);
    res.status(500).json({ error: 'Failed to get annotations for scene', message: error?.message });
  }
}

export async function getAnnotationGeometriesForSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const geometries = await getAnnotationGeometriesForSceneAssets(projectId, sceneId, includeErasable);
    if (!geometries.ok) {
      sendMappedError(res, geometries, {
        invalid_input: { status: 400, error: 'Invalid scene id' },
        scene_not_found: { status: 404, error: 'Scene not found' },
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
      res.status(404).json({ error: 'Annotation geometry not found' });
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
      sendMappedError(res, createResult, {
        invalid_input: { status: 400, error: 'Invalid geometry payload' },
        reference_not_found: { status: 404, error: 'Referenced scene or asset not found' },
        invalid_geometry_document: { status: 400, error: 'Geometry payload is semantically invalid' },
        duplicate_geometry: { status: 409, error: 'Generated geometry id already exists' },
      });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, createResult.value, true);
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
      sendMappedError(res, updateResult, {
        invalid_input: { status: 400, error: 'Invalid geometry update payload' },
        geometry_not_found: { status: 404, error: 'Annotation geometry not found' },
        version_conflict: { status: 409, error: 'Geometry version conflict' },
        invalid_geometry_document: { status: 400, error: 'Updated geometry is semantically invalid' },
      });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
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
      sendMappedError(res, transitionResult, {
        invalid_input: { status: 400, error: 'expectedVersion is required' },
        geometry_not_found: { status: 404, error: 'Annotation geometry not found' },
        already_erasable: { status: 409, error: 'Annotation geometry is already erasable' },
        version_conflict: { status: 409, error: 'Geometry version conflict' },
        invalid_geometry_document: { status: 400, error: 'Geometry erasable transition produced an invalid document' },
      });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
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
      sendMappedError(res, restoreResult, {
        invalid_input: { status: 400, error: 'expectedVersion is required' },
        geometry_not_found: { status: 404, error: 'Annotation geometry not found' },
        already_non_erasable: { status: 409, error: 'Annotation geometry is already non-erasable' },
        version_conflict: { status: 409, error: 'Geometry version conflict' },
        invalid_geometry_document: { status: 400, error: 'Geometry restore produced an invalid document' },
      });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
    res.json({ success: true, version: restoreResult.value, updatedAt: geometry?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to restore geometry:', error);
    res.status(500).json({ error: 'Failed to restore geometry', message: error?.message });
  }
}

export async function getAnnotationDataForSceneHandler(req: Request, res: Response) {
  try {
    const { projectId, sceneId } = req.params;
    const includeErasable = parseBooleanQuery(req.query.includeErasable);
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const data = await getAnnotationDataForSceneAssets(projectId, sceneId, includeErasable);
    if (!data.ok) {
      sendMappedError(res, data, {
        invalid_input: { status: 400, error: 'Invalid scene id' },
        scene_not_found: { status: 404, error: 'Scene not found' },
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
      res.status(404).json({ error: 'Annotation data not found' });
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
      sendMappedError(res, createResult, {
        invalid_input: { status: 400, error: 'Invalid annotation data payload' },
        reference_not_found: { status: 404, error: 'Referenced scene or asset not found' },
        invalid_data_document: { status: 400, error: 'Annotation data payload is semantically invalid' },
        duplicate_data: { status: 409, error: 'Generated annotation data id already exists' },
      });
      return;
    }

    const datum = await getAnnotationData(projectId, createResult.value, true);
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
      sendMappedError(res, updateResult, {
        invalid_input: { status: 400, error: 'Invalid annotation data payload' },
        data_not_found: { status: 404, error: 'Annotation data not found' },
        no_mutable_fields: { status: 400, error: 'No mutable fields provided' },
        version_conflict: { status: 409, error: 'Annotation data version conflict' },
        invalid_data_document: { status: 400, error: 'Updated annotation data is semantically invalid' },
      });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
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
      sendMappedError(res, transitionResult, {
        invalid_input: { status: 400, error: 'expectedVersion is required' },
        data_not_found: { status: 404, error: 'Annotation data not found' },
        already_erasable: { status: 409, error: 'Annotation data is already erasable' },
        version_conflict: { status: 409, error: 'Annotation data version conflict' },
        invalid_data_document: { status: 400, error: 'Annotation data erasable transition produced an invalid document' },
      });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
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
      sendMappedError(res, restoreResult, {
        invalid_input: { status: 400, error: 'expectedVersion is required' },
        data_not_found: { status: 404, error: 'Annotation data not found' },
        already_non_erasable: { status: 409, error: 'Annotation data is already non-erasable' },
        version_conflict: { status: 409, error: 'Annotation data version conflict' },
        invalid_data_document: { status: 400, error: 'Annotation data restore produced an invalid document' },
      });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
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
    const geometryId = typeof req.query.geometryId === 'string' ? req.query.geometryId : undefined;
    const dataId = typeof req.query.dataId === 'string' ? req.query.dataId : undefined;
    const currentUser = await requireProjectRole(req, res, projectId, [
      RoleEnum.viewer,
      RoleEnum.editor,
      RoleEnum.manager,
    ]);
    if (!currentUser) return;

    const links = await getAnnotationLinksForProject(projectId, includeErasable, { geometryId, dataId });
    res.json({ success: true, links });
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
      sendMappedError(res, links, {
        invalid_input: { status: 400, error: 'Invalid scene id' },
        scene_not_found: { status: 404, error: 'Scene not found' },
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
      res.status(404).json({ error: 'Annotation link not found' });
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
      sendMappedError(res, createResult, {
        invalid_input: { status: 400, error: 'geometryId and dataId are required' },
        project_context_not_available: { status: 409, error: 'Project annotation context is not available' },
        geometry_not_found: { status: 404, error: 'Referenced geometry not found' },
        data_not_found: { status: 404, error: 'Referenced annotation data not found' },
        duplicate_link_pair: { status: 409, error: 'Link pair already exists' },
        scope_incompatible: { status: 409, error: 'Geometry and annotation data scopes are incompatible' },
        invalid_link_document: { status: 400, error: 'Annotation link payload is semantically invalid' },
      });
      return;
    }

    const link = await getAnnotationLink(projectId, createResult.value, true);
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
      sendMappedError(res, transitionResult, {
        invalid_input: { status: 400, error: 'expectedVersion is required' },
        link_not_found: { status: 404, error: 'Annotation link not found' },
        already_erasable: { status: 409, error: 'Annotation link is already erasable' },
        version_conflict: { status: 409, error: 'Annotation link version conflict' },
        invalid_link_document: { status: 400, error: 'Annotation link erasable transition produced an invalid document' },
      });
      return;
    }

    const link = await getAnnotationLink(projectId, linkId, true);
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

    const restoreResult = await markAnnotationLinkNonErasable(projectId, linkId, expectedVersion, currentUser.id);
    if (!restoreResult.ok) {
      sendMappedError(res, restoreResult, {
        invalid_input: { status: 400, error: 'expectedVersion is required' },
        link_not_found: { status: 404, error: 'Annotation link not found' },
        already_non_erasable: { status: 409, error: 'Annotation link is already non-erasable' },
        geometry_not_found: { status: 409, error: 'Linked geometry no longer exists' },
        data_not_found: { status: 409, error: 'Linked annotation data no longer exists' },
        geometry_still_erasable: { status: 409, error: 'Linked geometry is still erasable' },
        data_still_erasable: { status: 409, error: 'Linked annotation data is still erasable' },
        version_conflict: { status: 409, error: 'Annotation link version conflict' },
        invalid_link_document: { status: 400, error: 'Annotation link restore produced an invalid document' },
      });
      return;
    }

    const link = await getAnnotationLink(projectId, linkId, true);
    res.json({ success: true, ...restoreResult.value, updatedAt: link?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to restore annotation link:', error);
    res.status(500).json({ error: 'Failed to restore annotation link', message: error?.message });
  }
}