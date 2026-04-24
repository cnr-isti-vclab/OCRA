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
    res.json({ success: true, ...result });
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
    res.json({ success: true, geometries });
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

    const geometryId = await createAnnotationGeometry(
      projectId,
      shapes,
      referenceTypeResult.data,
      referenceId,
      currentUser.id,
    );
    if (!geometryId) {
      res.status(404).json({ error: 'Referenced scene or asset not found' });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
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

    const existing = await getAnnotationGeometry(projectId, geometryId, true);
    if (!existing) {
      res.status(404).json({ error: 'Annotation geometry not found' });
      return;
    }

    const version = await updateAnnotationGeometryShapes(projectId, geometryId, expectedVersion, shapes, currentUser.id);
    if (version === false) {
      res.status(409).json({ error: 'Geometry update conflict' });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
    res.json({ success: true, version, updatedAt: geometry?.updatedAt ?? null });
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

    const existing = await getAnnotationGeometry(projectId, geometryId, true);
    if (!existing) {
      res.status(404).json({ error: 'Annotation geometry not found' });
      return;
    }

    const version = await markAnnotationGeometryErasable(projectId, geometryId, expectedVersion, currentUser.id);
    if (version === false) {
      res.status(409).json({ error: 'Geometry erasable transition conflict' });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
    res.json({ success: true, version, updatedAt: geometry?.updatedAt ?? null });
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

    const existing = await getAnnotationGeometry(projectId, geometryId, true);
    if (!existing) {
      res.status(404).json({ error: 'Annotation geometry not found' });
      return;
    }

    const version = await markAnnotationGeometryNonErasable(projectId, geometryId, expectedVersion, currentUser.id);
    if (version === false) {
      res.status(409).json({ error: 'Geometry restore conflict' });
      return;
    }

    const geometry = await getAnnotationGeometry(projectId, geometryId, true);
    res.json({ success: true, version, updatedAt: geometry?.updatedAt ?? null });
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
    res.json({ success: true, data });
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

    const dataId = await createAnnotationData(
      projectId,
      label,
      description,
      annotationClass,
      content,
      visibilityTypeResult.data,
      visibilityId,
      currentUser.id,
    );
    if (!dataId) {
      res.status(404).json({ error: 'Referenced scene or asset not found' });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
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

    const existing = await getAnnotationData(projectId, dataId, true);
    if (!existing) {
      res.status(404).json({ error: 'Annotation data not found' });
      return;
    }

    const version = await updateAnnotationData(projectId, dataId, expectedVersion, updates, currentUser.id);
    if (version === false) {
      res.status(409).json({ error: 'Annotation data update conflict' });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
    res.json({ success: true, version, updatedAt: datum?.updatedAt ?? null });
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

    const existing = await getAnnotationData(projectId, dataId, true);
    if (!existing) {
      res.status(404).json({ error: 'Annotation data not found' });
      return;
    }

    const version = await markAnnotationDataErasable(projectId, dataId, expectedVersion, currentUser.id);
    if (version === false) {
      res.status(409).json({ error: 'Annotation data erasable transition conflict' });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
    res.json({ success: true, version, updatedAt: datum?.updatedAt ?? null });
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

    const existing = await getAnnotationData(projectId, dataId, true);
    if (!existing) {
      res.status(404).json({ error: 'Annotation data not found' });
      return;
    }

    const version = await markAnnotationDataNonErasable(projectId, dataId, expectedVersion, currentUser.id);
    if (version === false) {
      res.status(409).json({ error: 'Annotation data restore conflict' });
      return;
    }

    const datum = await getAnnotationData(projectId, dataId, true);
    res.json({ success: true, version, updatedAt: datum?.updatedAt ?? null });
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
    res.json({ success: true, links });
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

    const [geometry, datum] = await Promise.all([
      getAnnotationGeometry(projectId, geometryId, true),
      getAnnotationData(projectId, dataId, true),
    ]);
    if (!geometry || !datum) {
      res.status(404).json({ error: 'Referenced geometry or data not found' });
      return;
    }

    const linkId = await createAnnotationLink(projectId, geometryId, dataId, currentUser.id);
    if (!linkId) {
      res.status(409).json({ error: 'Link pair already exists or violates scope consistency' });
      return;
    }

    const link = await getAnnotationLink(projectId, linkId, true);
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

    const existing = await getAnnotationLink(projectId, linkId, true);
    if (!existing) {
      res.status(404).json({ error: 'Annotation link not found' });
      return;
    }

    const version = await markAnnotationLinkErasable(projectId, linkId, expectedVersion, currentUser.id);
    if (version === false) {
      res.status(409).json({ error: 'Annotation link erasable transition conflict' });
      return;
    }

    const link = await getAnnotationLink(projectId, linkId, true);
    res.json({ success: true, version, updatedAt: link?.updatedAt ?? null });
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

    const existing = await getAnnotationLink(projectId, linkId, true);
    if (!existing) {
      res.status(404).json({ error: 'Annotation link not found' });
      return;
    }

    const restoreResult = await markAnnotationLinkNonErasable(projectId, linkId, expectedVersion, currentUser.id);
    if (restoreResult === false) {
      res.status(409).json({ error: 'Annotation link restore conflict' });
      return;
    }

    const link = await getAnnotationLink(projectId, linkId, true);
    res.json({ success: true, ...restoreResult, updatedAt: link?.updatedAt ?? null });
  } catch (error: any) {
    console.error('Failed to restore annotation link:', error);
    res.status(500).json({ error: 'Failed to restore annotation link', message: error?.message });
  }
}