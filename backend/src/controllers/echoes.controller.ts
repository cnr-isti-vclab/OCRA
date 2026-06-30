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
  deleteDigitalTwinInEchoes,
  duplicateProjectHdtAsNewInEchoes,
  enrichProjectHdtInEchoes,
  getEchoesProjectStatus,
  getEchoesHdtDetail,
  listEchoesHdts,
  listEchoesNamedGraphs,
  registerProjectHdtInEchoes,
  replaceProjectHdtContentInEchoes,
} from '../services/echoes-kb.service.js';
import { isTemporarilyBlacklistedEchoesHdtUri } from '../services/echoes-temporary-blacklist.service.js';
import { getPublicBaseUrl } from '../utils/public-base-url.js';
import { getPrismaClient } from '../../db.js';

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

async function canUseEchoesImport(
  user: NonNullable<ReturnType<typeof getAuthenticatedUser>>,
): Promise<boolean> {
  return user.sys_admin || user.sys_creator === true;
}

function canManageEchoesDevBearer(
  user: NonNullable<ReturnType<typeof getAuthenticatedUser>>,
): boolean {
  return user.sys_admin;
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

function sendEchoesError(req: Request, res: Response, status: number, code: keyof typeof API_ERROR_CODES.echoes, error: string, details?: unknown): void {
  sendApiError(req, res, {
    status,
    code: API_ERROR_CODES.echoes[code],
    error,
    details,
  });
}

export async function listEchoesNamedGraphsHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  if (!(await canUseEchoesImport(user))) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to list ECCCH HDTs');
  }

  try {
    const search = typeof req.query.search === 'string' ? req.query.search : null;
    const items = (await listEchoesNamedGraphs(sessionId, search)).filter(
      (item) => !isTemporarilyBlacklistedEchoesHdtUri(item.digitalTwinUri),
    );
    res.json({ success: true, items });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      'listFailed',
      'Failed to list ECCCH named graphs',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function listEchoesHdtsHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  if (!(await canUseEchoesImport(user))) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to list ECCCH HDTs');
  }

  try {
    const search = typeof req.query.search === 'string' ? req.query.search : null;
    const items = (await listEchoesHdts(sessionId, search)).filter(
      (item) => !isTemporarilyBlacklistedEchoesHdtUri(item.digitalTwinUri),
    );
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

  if (!(await canUseEchoesImport(user))) {
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
    if (isTemporarilyBlacklistedEchoesHdtUri(digitalTwinUri)) {
      return sendEchoesError(req, res, 404, 'hdtNotFound', 'ECCCH HDT not found');
    }

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
      namedGraphImportMode:
        req.body?.namedGraphImportMode === 'continue_selected_graph' ||
        req.body?.namedGraphImportMode === 'start_new_branch'
          ? req.body.namedGraphImportMode
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
        ? await registerProjectHdtInEchoes(sessionId, projectId, getPublicBaseUrl(req), user.id)
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

export async function registerEchoesDevBearerHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  if (!canManageEchoesDevBearer(user)) {
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

  if (!canManageEchoesDevBearer(user)) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to clear an ECCCH bearer for this action');
  }

  clearEchoesDevBearerOverride(sessionId);
  res.status(204).end();
}

// @spike feature/eccch-delete-debug: remove after ECCCH delete is no longer needed in production
export async function deleteEchoesDigitalTwinHandler(req: Request, res: Response): Promise<void> {
  const user = getAuthenticatedUser(req);
  const sessionId = getSessionId(req);
  if (!user || !sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  if (!user.sys_admin) {
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Only system administrators can unregister ECCCH Digital Twins');
  }

  const digitalTwinUri =
    typeof req.body?.digitalTwinUri === 'string' && req.body.digitalTwinUri.trim()
      ? req.body.digitalTwinUri.trim()
      : '';

  if (!digitalTwinUri) {
    return sendEchoesError(req, res, 400, 'hdtUriRequired', 'digitalTwinUri is required');
  }

  try {
    const result = await deleteDigitalTwinInEchoes(sessionId, digitalTwinUri, user.id);

    await auditBestEffort({
      req,
      userSub: user.sub,
      action: 'echoes.digital_twin.delete',
      success: true,
      payload: {
        digitalTwinUri: result.digitalTwinUri,
        deletedNamedGraphUris: result.deletedNamedGraphUris,
        disconnectedProjectIds: result.disconnectedProjectIds,
      },
    });

    res.json({ success: true, ...result });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      'unregisterFailed',
      'Failed to delete this ECCCH Digital Twin',
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
