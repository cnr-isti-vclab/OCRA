import type { Request, Response } from 'express';
import { sendApiError } from '../lib/api-error.js';
import { API_ERROR_CODES } from '../lib/api-error-codes.js';
import { auditBestEffort } from '../utils/audit.js';
import {
  clearEchoesDevBearerOverride,
  setEchoesDevBearerOverride,
} from '../services/echoes-dev-bearer.service.js';
import {
  createProjectFromEchoesHdt,
  getEchoesHdtDetail,
  listEchoesHdts,
} from '../services/echoes-kb.service.js';
import { getPublicBaseUrl } from '../utils/public-base-url.js';

function getAuthenticatedUser(req: Request) {
  return req.user ?? null;
}

function getSessionId(req: Request): string | null {
  return req.sessionId ?? null;
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
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
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
      'Failed to list ECHOES HDTs',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function getEchoesHdtHandler(req: Request, res: Response): Promise<void> {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
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

  try {
    const item = await getEchoesHdtDetail(sessionId, digitalTwinUri);
    if (!item) {
      return sendEchoesError(req, res, 404, 'hdtNotFound', 'ECHOES HDT not found');
    }
    res.json({ success: true, item });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      'detailFailed',
      'Failed to read ECHOES HDT details',
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
    return sendEchoesError(req, res, 403, 'projectCreateDenied', 'Insufficient permissions to create projects from ECHOES');
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
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      description: typeof req.body?.description === 'string' ? req.body.description : undefined,
      public: req.body?.public === true,
      publicBaseUrl: getPublicBaseUrl(req),
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
      },
    });

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    sendEchoesError(
      req,
      res,
      502,
      'projectCreateFailed',
      'Failed to create a project from ECHOES HDT',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function registerEchoesDevBearerHandler(req: Request, res: Response): Promise<void> {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
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
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendEchoesError(req, res, 401, 'authenticationRequired', 'Authentication required');
  }

  clearEchoesDevBearerOverride(sessionId);
  res.status(204).end();
}
