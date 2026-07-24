import { getApiBase } from '../config/oauth';

interface CreateHdtAssetResponse {
  success: boolean;
  assetId: string;
}

interface RemoteAssetImportResponse {
  success?: boolean;
  value?: {
    type: string;
    fileName?: string;
    entrySize?: number;
    entryPointUrl?: string;
    entryPoint?: string;
    mimeType?: string;
    sourceUrl?: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
  message?: string;
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export async function createRemoteAsset(
  projectId: string,
  input: {
    type: '3d-model' | 'image';
    label: string;
    title?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const sessionId = localStorage.getItem('oauth_session_id');
  const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/assets`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${sessionId}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: input.type,
      label: input.label,
      title: input.title,
      description: input.description,
      metadata: input.metadata ?? {},
    }),
  });

  const data = await parseJson<CreateHdtAssetResponse & { error?: string }>(response);
  if (!response.ok || !data.assetId) {
    throw new Error(data.error || 'Failed to create the target OCRA asset.');
  }

  return data.assetId;
}

export async function createRemoteModelAsset(
  projectId: string,
  input: Omit<Parameters<typeof createRemoteAsset>[1], 'type'>,
): Promise<string> {
  return createRemoteAsset(projectId, { ...input, type: '3d-model' });
}

export async function importRemoteAssetIntoHdt(
  projectId: string,
  assetId: string,
  sourceUrl: string
): Promise<NonNullable<RemoteAssetImportResponse['value']>> {
  const response = await fetch(`${getApiBase()}/api/projects/${projectId}/files/import-url`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assetId,
      sourceUrl,
      authType: 'none',
    }),
  });

  const data = await parseJson<RemoteAssetImportResponse>(response);
  if (!response.ok || !data.value) {
    throw new Error(data.message || data.error || 'Failed to import the remote 3D asset.');
  }

  return data.value;
}

export async function updateHdtAsset(
  projectId: string,
  assetId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const sessionId = localStorage.getItem('oauth_session_id');
  const response = await fetch(`${getApiBase()}/api/projects/${projectId}/hdt/assets/${assetId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${sessionId}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Failed to finalize the imported 3D asset.');
  }
}
