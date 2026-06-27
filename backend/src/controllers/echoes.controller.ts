import type { Request, Response } from 'express';
import multer from 'multer';
import { RoleEnum } from '@prisma/client';
import { sendApiError } from '../lib/api-error.js';
import { API_ERROR_CODES } from '../lib/api-error-codes.js';
import { auditBestEffort } from '../utils/audit.js';
import {
  clearEchoesDevBearerOverride,
  setEchoesDevBearerOverride,
} from '../services/echoes-dev-bearer.service.js';
import {
  createProjectFromEchoesHdt,
  createProjectFromEchoesRdf,
  duplicateProjectHdtAsNewInEchoes,
  enrichProjectHdtInEchoes,
  forceLinkProjectToEchoesHdt,
  getEchoesProjectStatus,
  getEchoesHdtDetail,
  listEchoesHdts,
  registerProjectHdtInEchoes,
  replaceProjectHdtContentInEchoes,
} from '../services/echoes-kb.service.js';
import { getPublicBaseUrl } from '../utils/public-base-url.js';
import { getPrismaClient } from '../../db.js';

type EchoesBearerScope = 'import' | 'register' | 'publish';
type EchoesProjectMutationAction = 'register' | 'enrich' | 'replace-content';
const rdfImportUpload = multer({ storage: multer.memoryStorage() });

function getAuthenticatedUser(req: Request) {
  return req.user ?? null;
}

function getSessionId(req: Request): string | null {
  return req.sessionId ?? null;
}

async function isProjectManager(userId: string, projectId: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const managerRole = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId,
      role: RoleEnum.manager,
    },
  });

  return Boolean(managerRole);
}

async function canUseEchoesBearerScope(
  user: NonNullable<ReturnType<typeof getAuthenticatedUser>>,
  scope: EchoesBearerScope,
  projectId?: string,
): Promise<boolean> {
  if (user.sys_admin) {
    return true;
  }

  if (scope === 'import') {
    return user.sys_creator === true;
  }

  if (!projectId) {
    return false;
  }

  if (scope === 'register' || scope === 'publish') {
    return isProjectManager(user.id, projectId);
  }

  return false;
}

async function canPerformEchoesProjectAction(
  user: NonNullable<ReturnType<typeof getAuthenticatedUser>>,
  projectId: string,
  action: EchoesProjectMutationAction,
): Promise<boolean> {
  if (user.sys_admin) {
    return true;
  }

  if (action === 'register' || action === 'enrich' || action === 'replace-content') {
    return isProjectManager(user.id, projectId);
  }

  return false;
}

function readEchoesBearerScope(rawScope: unknown): EchoesBearerScope | null {
  if (rawScope === 'import' || rawScope === 'register' || rawScope === 'publish') {
    return rawScope;
  }

  return null;
}

function sendEchoesError(req: Request, res: Response, status: number, code: keyof typeof API_ERROR_CODES.echoes, error: string, details?: unknown): void {
  sendApiError(req, res, {
    status,
    code: API_ERROR_CODES.echoes[code],
    error,
    details,
  });
}

export async function listEchoesHdtsHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  if (!(await canUseEchoesBearerScope(user, 'import'))) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to list ECCCH HDTs');
  }

  try {
    const search = typeof req.query.search === 'string' ? req.query.search : null;
    const items = await listEchoesHdts(sessionId, search);
    res.json({ success: true, items });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      'listFailed',
      'Failed to list ECCCH HDTs',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function getEchoesHdtHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  if (!(await canUseEchoesBearerScope(user, 'import'))) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to read ECCCH HDT details');
  }

  const encodedHdtId = req.params.hdtId;
  if (!encodedHdtId) {
    return sendEchoesError(req, res, 400, 'hdtUriRequired', 'The HDT URI is required');
  }

  let digitalTwinUri: string;
  try {
    digitalTwinUri = decodeURIComponent(encodedHdtId);
  } catch {
    return sendEchoesError(req, res, 400, 'invalidHdtUri', 'The HDT URI is not a valid encoded value');
  }

  const namedGraphUri =
    typeof req.query.namedGraph === 'string' && req.query.namedGraph.trim()
      ? req.query.namedGraph.trim()
      : undefined;

  try {
    const item = await getEchoesHdtDetail(sessionId, digitalTwinUri, namedGraphUri);
    if (!item) {
      return sendEchoesError(req, res, 404, 'hdtNotFound', 'ECCCH HDT not found');
    }
    res.json({ success: true, item });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      'detailFailed',
      'Failed to read ECCCH HDT details',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function createProjectFromEchoesHdtHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  if (!user.sys_admin && !user.sys_creator) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to create projects from ECCCH');
  }

  const digitalTwinUri =
    typeof req.body?.digitalTwinUri === 'string' && req.body.digitalTwinUri.trim()
      ? req.body.digitalTwinUri.trim()
      : '';

  if (!digitalTwinUri) {
    return sendEchoesError(req, res, 400, 'hdtUriRequired', 'digitalTwinUri is required');
  }

  try {
    const result = await createProjectFromEchoesHdt(sessionId, user, {
      digitalTwinUri,
      namedGraphUri: typeof req.body?.namedGraphUri === 'string' && req.body.namedGraphUri.trim()
        ? req.body.namedGraphUri.trim()
        : undefined,
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      description: typeof req.body?.description === 'string' ? req.body.description : undefined,
      public: req.body?.public === true,
      publicBaseUrl: getPublicBaseUrl(req),
      importMode:
        req.body?.importMode === 'metadata_assets' ||
        req.body?.importMode === 'full_project_without_annotations' ||
        req.body?.importMode === 'full_project_with_annotations'
          ? req.body.importMode
          : undefined,
    });

    await auditBestEffort({
      req,
      userSub: user.sub,
      action: 'echoes.project.import',
      success: true,
      payload: {
        digitalTwinUri,
        namedGraphUri: result.echoes.namedGraphUri,
        projectId: result.project.id,
        importedAssetCount: result.importedAssetCount,
        importedAnnotationCount: result.importedAnnotationCount,
      },
    });

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      'projectCreateFailed',
      'Failed to create a project from ECCCH HDT',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export const importProjectFromEchoesRdfUploadMiddleware = rdfImportUpload.single('file');

export async function createProjectFromEchoesRdfHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  if (!user.sys_admin && !user.sys_creator) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to create projects from RDF');
  }

  const file = req.file;
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    return sendEchoesError(req, res, 400, 'hdtUriRequired', 'A non-empty RDF file is required');
  }

  try {
    const result = await createProjectFromEchoesRdf(user, {
      rdf: file.buffer.toString('utf8'),
      fileName: file.originalname,
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      description: typeof req.body?.description === 'string' ? req.body.description : undefined,
      public: req.body?.public === 'true' || req.body?.public === true,
      publicBaseUrl: getPublicBaseUrl(req),
      importMode:
        req.body?.importMode === 'metadata_assets' ||
        req.body?.importMode === 'full_project_without_annotations' ||
        req.body?.importMode === 'full_project_with_annotations'
          ? req.body.importMode
          : undefined,
    });

    await auditBestEffort({
      req,
      userSub: user.sub,
      action: 'echoes.project.import_rdf',
      success: true,
      payload: {
        fileName: file.originalname,
        projectId: result.project.id,
        importedAssetCount: result.importedAssetCount,
        importedAnnotationCount: result.importedAnnotationCount,
      },
    });

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      'projectCreateFailed',
      'Failed to create a project from RDF',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function getEchoesProjectStatusHandler(req: Request, res: Response): Promise<void> {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId.trim() : '';
  if (!projectId) {
    return sendEchoesError(req, res, 400, 'hdtUriRequired', 'projectId is required');
  }

  try {
    const status = await getEchoesProjectStatus(projectId);
    if (!status) {
      return sendEchoesError(req, res, 404, 'hdtNotFound', 'Project HDT not found');
    }
    res.json({ success: true, status });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      500,
      'publishStatusFailed',
      'Failed to read ECCCH publication status',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

async function handleEchoesProjectMutation(
  req: Request,
  res: Response,
  action: EchoesProjectMutationAction,
): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId.trim() : '';
  if (!projectId) {
    return sendEchoesError(req, res, 400, 'hdtUriRequired', 'projectId is required');
  }

  if (!(await canPerformEchoesProjectAction(user, projectId, action))) {
    const message =
      action === 'register'
        ? 'Only project managers and system administrators can register project HDTs in ECCCH'
        : 'Only project managers and system administrators can publish project HDTs to ECCCH';
    return sendEchoesError(req, res, 403, 'projectCreateDenied', message);
  }

  try {
    const result =
      action === 'register'
        ? await registerProjectHdtInEchoes(sessionId, projectId, user.id)
        : action === 'enrich'
          ? await enrichProjectHdtInEchoes(sessionId, projectId, getPublicBaseUrl(req), user.id)
          : await replaceProjectHdtContentInEchoes(sessionId, projectId, getPublicBaseUrl(req), user.id);

    await auditBestEffort({
      req,
      userSub: user.sub,
      action: `echoes.project.${action}`,
      success: true,
      payload: {
        projectId,
        digitalTwinUri: result.status.digitalTwinUri,
        namedGraphUri: result.status.namedGraphUri,
        syncStatus: result.status.syncStatus,
      },
    });

    res.json({ success: true, ...result });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      action === 'register' ? 'registerFailed' : action === 'enrich' ? 'enrichFailed' : 'replaceFailed',
      `Failed to ${action} ECCCH HDT content`,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function registerProjectHdtInEchoesHandler(req: Request, res: Response): Promise<void> {
  await handleEchoesProjectMutation(req, res, 'register');
}

export async function enrichProjectHdtInEchoesHandler(req: Request, res: Response): Promise<void> {
  await handleEchoesProjectMutation(req, res, 'enrich');
}

export async function replaceProjectHdtContentInEchoesHandler(req: Request, res: Response): Promise<void> {
  await handleEchoesProjectMutation(req, res, 'replace-content');
}

export async function duplicateProjectHdtAsNewInEchoesHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  if (!user.sys_admin) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Only system administrators can duplicate a project as a new ECCCH HDT');
  }

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId.trim() : '';
  if (!projectId) {
    return sendEchoesError(req, res, 400, 'hdtUriRequired', 'projectId is required');
  }

  try {
    const result = await duplicateProjectHdtAsNewInEchoes(sessionId, projectId, getPublicBaseUrl(req), {
      title: typeof req.body?.title === 'string' ? req.body.title : undefined,
      description: typeof req.body?.description === 'string' ? req.body.description : undefined,
      identifier: typeof req.body?.identifier === 'string' ? req.body.identifier : undefined,
      heritageEntityUri: typeof req.body?.heritageEntityUri === 'string' ? req.body.heritageEntityUri : undefined,
    });

    await auditBestEffort({
      req,
      userSub: user.sub,
      action: 'echoes.project.duplicate-as-new-hdt',
      success: true,
      payload: {
        projectId,
        digitalTwinUri: result.status.digitalTwinUri,
        namedGraphUri: result.status.namedGraphUri,
        heritageEntityUri: result.status.heritageEntityUri,
      },
    });

    res.json({ success: true, ...result });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      'duplicateFailed',
      'Failed to duplicate this project as a new ECCCH HDT',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function forceLinkProjectToEchoesHdtHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }
  if (!user.sys_admin) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Only system administrators can force-link a project to an ECCCH HDT');
  }

  const projectId = typeof req.params.projectId === 'string' ? req.params.projectId.trim() : '';
  if (!projectId) {
    return sendEchoesError(req, res, 400, 'projectIdRequired', 'projectId is required');
  }

  const digitalTwinUri = typeof req.body?.digitalTwinUri === 'string' ? req.body.digitalTwinUri.trim() : '';
  if (!digitalTwinUri) {
    return sendEchoesError(req, res, 400, 'digitalTwinUriRequired', 'digitalTwinUri is required');
  }

  try {
    const result = await forceLinkProjectToEchoesHdt(projectId, digitalTwinUri, user.sub);
    await auditBestEffort({
      req,
      userSub: user.sub,
      action: 'echoes.project.force-link',
      success: true,
      payload: { projectId, digitalTwinUri },
    });
    res.json({ success: true, ...result });
  } catch (error) {
    sendEchoesError(
      req, res, 400, 'forceLinkFailed',
      'Failed to force-link project to ECCCH HDT',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function registerEchoesDevBearerHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  const scope = readEchoesBearerScope(req.body?.scope);
  if (!scope) {
    return sendEchoesError(req, res, 400, 'bearerRequired', 'scope is required and must be one of: import, register, publish');
  }

  const projectId =
    typeof req.body?.projectId === 'string' && req.body.projectId.trim()
      ? req.body.projectId.trim()
      : undefined;

  if (!(await canUseEchoesBearerScope(user, scope, projectId))) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to register an ECCCH bearer for this action');
  }

  const bearer =
    typeof req.body?.bearer === 'string' && req.body.bearer.trim()
      ? req.body.bearer.trim()
      : '';

  if (!bearer) {
    return sendEchoesError(req, res, 400, 'bearerRequired', 'bearer is required');
  }

  setEchoesDevBearerOverride(sessionId, bearer);
  res.status(204).end();
}

export async function clearEchoesDevBearerHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  const scope = readEchoesBearerScope(req.body?.scope);
  if (!scope) {
    return sendEchoesError(req, res, 400, 'bearerRequired', 'scope is required and must be one of: import, register, publish');
  }

  const projectId =
    typeof req.body?.projectId === 'string' && req.body.projectId.trim()
      ? req.body.projectId.trim()
      : undefined;

  if (!(await canUseEchoesBearerScope(user, scope, projectId))) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to clear an ECCCH bearer for this action');
  }

  clearEchoesDevBearerOverride(sessionId);
  res.status(204).end();
}
