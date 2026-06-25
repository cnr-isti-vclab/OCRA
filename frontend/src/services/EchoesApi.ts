import { getApiBase } from '../config/oauth';
import type {
  EchoesHdtDetail,
  EchoesHdtListItem,
  EchoesImportedProjectSummary,
  EchoesProjectStatus,
} from '../types';

interface ApiErrorResponse {
  error?: string;
  message?: string;
  details?: unknown;
}

interface EchoesHdtListResponse {
  success: boolean;
  items: EchoesHdtListItem[];
}

interface EchoesHdtDetailResponse {
  success: boolean;
  item: EchoesHdtDetail;
}

interface EchoesCreateProjectResponse {
  success: boolean;
  project: EchoesImportedProjectSummary;
  echoes: EchoesHdtDetail;
  importedAssetCount: number;
}

interface EchoesProjectStatusResponse {
  success: boolean;
  status: EchoesProjectStatus;
}

interface EchoesPublishProjectResponse {
  success: boolean;
  status: EchoesProjectStatus;
  rdf: {
    contentType: 'application/rdf+xml';
    size: number;
  };
}

interface EchoesDuplicateProjectRequest {
  title?: string;
  description?: string;
  identifier?: string;
  heritageEntityUri?: string;
}

function getStoredSessionId(): string | null {
  return typeof window !== 'undefined' ? window.localStorage.getItem('oauth_session_id') : null;
}

function buildSessionHeaders(includeJsonContentType: boolean): HeadersInit {
  const sessionId = getStoredSessionId();
  const headers: Record<string, string> = {};

  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (sessionId) {
    headers.Authorization = `Bearer ${sessionId}`;
  }

  return headers;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    const details =
      typeof payload.details === 'string'
        ? payload.details
        : Array.isArray(payload.details)
          ? payload.details.join('; ')
          : undefined;
    return details || payload.error || payload.message || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function registerEchoesDevBearer(bearer: string): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/echoes/dev/bearer`, {
    method: 'POST',
    credentials: 'include',
    headers: buildSessionHeaders(true),
    body: JSON.stringify({ bearer }),
  });

  if (!response.ok) {
    throw new Error(`Failed to register ECHOES bearer: ${await readErrorMessage(response)}`);
  }
}

export async function clearEchoesDevBearer(): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/echoes/dev/bearer`, {
    method: 'DELETE',
    credentials: 'include',
    headers: buildSessionHeaders(false),
  });

  if (!response.ok) {
    throw new Error(`Failed to clear ECHOES bearer: ${await readErrorMessage(response)}`);
  }
}

export async function fetchEchoesHdts(search: string): Promise<EchoesHdtListItem[]> {
  const url = new URL(`${getApiBase()}/api/echoes/hdts`);
  if (search.trim()) {
    url.searchParams.set('search', search.trim());
  }

  const response = await fetch(url.toString(), {
    credentials: 'include',
    headers: buildSessionHeaders(false),
  });

  if (!response.ok) {
    throw new Error(`Failed to list ECHOES HDTs: ${await readErrorMessage(response)}`);
  }

  const payload = (await response.json()) as EchoesHdtListResponse;
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function fetchEchoesHdtDetail(digitalTwinUri: string): Promise<EchoesHdtDetail> {
  const response = await fetch(
    `${getApiBase()}/api/echoes/hdts/${encodeURIComponent(digitalTwinUri)}`,
    {
      credentials: 'include',
      headers: buildSessionHeaders(false),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load ECHOES HDT details: ${await readErrorMessage(response)}`);
  }

  const payload = (await response.json()) as EchoesHdtDetailResponse;
  return payload.item;
}

export async function createProjectFromEchoesHdt(input: {
  digitalTwinUri: string;
  name?: string;
  description?: string;
  public?: boolean;
}): Promise<EchoesCreateProjectResponse> {
  const response = await fetch(`${getApiBase()}/api/echoes/projects`, {
    method: 'POST',
    credentials: 'include',
    headers: buildSessionHeaders(true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to import project from ECHOES: ${await readErrorMessage(response)}`);
  }

  return (await response.json()) as EchoesCreateProjectResponse;
}

export async function fetchEchoesProjectStatus(projectId: string): Promise<EchoesProjectStatus> {
  const response = await fetch(`${getApiBase()}/api/echoes/projects/${encodeURIComponent(projectId)}/status`, {
    credentials: 'include',
    headers: buildSessionHeaders(false),
  });

  if (!response.ok) {
    throw new Error(`Failed to read ECHOES project status: ${await readErrorMessage(response)}`);
  }

  const payload = (await response.json()) as EchoesProjectStatusResponse;
  return payload.status;
}

async function postEchoesProjectAction(
  projectId: string,
  action: 'register' | 'enrich' | 'replace-content',
): Promise<EchoesPublishProjectResponse | EchoesProjectStatusResponse> {
  const response = await fetch(`${getApiBase()}/api/echoes/projects/${encodeURIComponent(projectId)}/${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: buildSessionHeaders(false),
  });

  if (!response.ok) {
    throw new Error(`Failed to ${action} ECHOES project: ${await readErrorMessage(response)}`);
  }

  return (await response.json()) as EchoesPublishProjectResponse | EchoesProjectStatusResponse;
}

export async function registerProjectHdtInEchoes(projectId: string): Promise<EchoesProjectStatus> {
  const payload = (await postEchoesProjectAction(projectId, 'register')) as EchoesProjectStatusResponse;
  return payload.status;
}

export async function enrichProjectHdtInEchoes(projectId: string): Promise<EchoesPublishProjectResponse> {
  return (await postEchoesProjectAction(projectId, 'enrich')) as EchoesPublishProjectResponse;
}

export async function replaceProjectHdtContentInEchoes(projectId: string): Promise<EchoesPublishProjectResponse> {
  return (await postEchoesProjectAction(projectId, 'replace-content')) as EchoesPublishProjectResponse;
}

export async function duplicateProjectHdtAsNewInEchoes(
  projectId: string,
  input: EchoesDuplicateProjectRequest,
): Promise<EchoesPublishProjectResponse> {
  const response = await fetch(`${getApiBase()}/api/echoes/projects/${encodeURIComponent(projectId)}/duplicate-as-new-hdt`, {
    method: 'POST',
    credentials: 'include',
    headers: buildSessionHeaders(true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to duplicate ECHOES project as new HDT: ${await readErrorMessage(response)}`);
  }

  return (await response.json()) as EchoesPublishProjectResponse;
}
