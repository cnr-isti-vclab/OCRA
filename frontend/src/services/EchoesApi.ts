import { getApiBase } from '../config/oauth';
import type {
  EchoesHdtDetail,
  EchoesHdtListItem,
  EchoesImportedProjectSummary,
  EchoesImportMode,
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
  importedAnnotationCount: number;
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

export type EchoesBearerScope = 'import' | 'register' | 'publish';

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

export async function registerEchoesDevBearer(input: {
  bearer: string;
  scope: EchoesBearerScope;
  projectId?: string;
}): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/eccch/dev/bearer`, {
    method: 'POST',
    credentials: 'include',
    headers: buildSessionHeaders(true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to register ECCCH bearer: ${await readErrorMessage(response)}`);
  }
}

export async function clearEchoesDevBearer(input: {
  scope: EchoesBearerScope;
  projectId?: string;
}): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/eccch/dev/bearer`, {
    method: 'DELETE',
    credentials: 'include',
    headers: buildSessionHeaders(true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to clear ECCCH bearer: ${await readErrorMessage(response)}`);
  }
}

export async function fetchEchoesHdts(search: string): Promise<EchoesHdtListItem[]> {
  const url = new URL(`${getApiBase()}/api/eccch/hdts`);
  if (search.trim()) {
    url.searchParams.set('search', search.trim());
  }

  const response = await fetch(url.toString(), {
    credentials: 'include',
    headers: buildSessionHeaders(false),
  });

  if (!response.ok) {
    throw new Error(`Failed to list ECCCH HDTs: ${await readErrorMessage(response)}`);
  }

  const payload = (await response.json()) as EchoesHdtListResponse;
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function fetchEchoesHdtDetail(digitalTwinUri: string, namedGraphUri?: string): Promise<EchoesHdtDetail> {
  const url = new URL(`${getApiBase()}/api/eccch/hdts/${encodeURIComponent(digitalTwinUri)}`);
  if (namedGraphUri) {
    url.searchParams.set('namedGraph', namedGraphUri);
  }

  const response = await fetch(url.toString(), {
      credentials: 'include',
      headers: buildSessionHeaders(false),
    });

  if (!response.ok) {
    throw new Error(`Failed to load ECCCH HDT details: ${await readErrorMessage(response)}`);
  }

  const payload = (await response.json()) as EchoesHdtDetailResponse;
  return payload.item;
}

export async function createProjectFromEchoesHdt(input: {
  digitalTwinUri: string;
  namedGraphUri?: string;
  name?: string;
  description?: string;
  public?: boolean;
  importMode?: EchoesImportMode;
}): Promise<EchoesCreateProjectResponse> {
  const response = await fetch(`${getApiBase()}/api/eccch/projects`, {
    method: 'POST',
    credentials: 'include',
    headers: buildSessionHeaders(true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to import project from the ECCCH repository: ${await readErrorMessage(response)}`);
  }

  return (await response.json()) as EchoesCreateProjectResponse;
}

export async function createProjectFromEchoesRdf(input: {
  file: File;
  name?: string;
  description?: string;
  public?: boolean;
  importMode?: EchoesImportMode;
}): Promise<EchoesCreateProjectResponse> {
  const formData = new FormData();
  formData.append('file', input.file);
  if (input.name) {
    formData.append('name', input.name);
  }
  if (input.description) {
    formData.append('description', input.description);
  }
  if (input.public === true) {
    formData.append('public', 'true');
  }
  if (input.importMode) {
    formData.append('importMode', input.importMode);
  }

  const response = await fetch(`${getApiBase()}/api/eccch/projects/import-rdf`, {
    method: 'POST',
    credentials: 'include',
    headers: buildSessionHeaders(false),
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to import project from RDF: ${await readErrorMessage(response)}`);
  }

  return (await response.json()) as EchoesCreateProjectResponse;
}

export async function fetchEchoesProjectStatus(projectId: string): Promise<EchoesProjectStatus> {
  const response = await fetch(`${getApiBase()}/api/eccch/projects/${encodeURIComponent(projectId)}/status`, {
    credentials: 'include',
    headers: buildSessionHeaders(false),
  });

  if (!response.ok) {
    throw new Error(`Failed to read ECCCH project status: ${await readErrorMessage(response)}`);
  }

  const payload = (await response.json()) as EchoesProjectStatusResponse;
  return payload.status;
}

async function postEchoesProjectAction(
  projectId: string,
  action: 'register' | 'enrich' | 'replace-content',
): Promise<EchoesPublishProjectResponse | EchoesProjectStatusResponse> {
  const response = await fetch(`${getApiBase()}/api/eccch/projects/${encodeURIComponent(projectId)}/${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: buildSessionHeaders(false),
  });

  if (!response.ok) {
    throw new Error(`Failed to ${action} ECCCH project: ${await readErrorMessage(response)}`);
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
  const response = await fetch(`${getApiBase()}/api/eccch/projects/${encodeURIComponent(projectId)}/duplicate-as-new-hdt`, {
    method: 'POST',
    credentials: 'include',
    headers: buildSessionHeaders(true),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to duplicate ECCCH project as new HDT: ${await readErrorMessage(response)}`);
  }

  return (await response.json()) as EchoesPublishProjectResponse;
}
