import { getApiBase } from '../config/oauth';

export type ProjectPresenceMode = 'viewing' | 'editing' | 'structuring';
export type StructuringLockState = 'draining' | 'exclusive';

export interface ProjectPresencePayload {
  mode: ProjectPresenceMode;
  sceneId?: string;
  clientInstanceId?: string;
}

export interface StructuringStartPayload {
  operationType?: string;
  operationContext?: Record<string, unknown>;
}

export interface StructuringHeartbeatPayload {
  fencingToken: number;
}

export interface StructuringStopPayload {
  fencingToken: number;
}

export interface PresenceLeaseResponse {
  success: true;
  projectId: string;
  mode: ProjectPresenceMode;
  heartbeatExpiresAt: string;
  stopped?: boolean;
}

export interface StructuringLockResponse {
  success: true;
  state: StructuringLockState;
  projectId: string;
  fencingToken: number;
  heartbeatExpiresAt: string;
  ownerSessionId?: string;
  remainingPresenceCount?: number;
  releasedAt?: string;
}

interface ApiErrorEnvelope {
  error?: string;
  message?: string;
  code?: string;
  status?: number;
  details?: unknown;
}

export class ProjectStructuringApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;

  constructor(message: string, status: number, code: string | null, details?: unknown) {
    super(message);
    this.name = 'ProjectStructuringApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ProjectStructuringService {
  constructor(private readonly projectId: string) {}

  async startPresence(payload: ProjectPresencePayload): Promise<PresenceLeaseResponse> {
    return this.requestJson<PresenceLeaseResponse>('/presence/start', payload);
  }

  async heartbeatPresence(payload: ProjectPresencePayload): Promise<PresenceLeaseResponse> {
    return this.requestJson<PresenceLeaseResponse>('/presence/heartbeat', payload);
  }

  async stopPresence(payload: ProjectPresencePayload): Promise<PresenceLeaseResponse> {
    return this.requestJson<PresenceLeaseResponse>('/presence/stop', payload);
  }

  async startStructuring(payload: StructuringStartPayload = {}): Promise<StructuringLockResponse> {
    return this.requestJson<StructuringLockResponse>('/structuring/start', payload);
  }

  async heartbeatStructuring(payload: StructuringHeartbeatPayload): Promise<StructuringLockResponse> {
    return this.requestJson<StructuringLockResponse>('/structuring/heartbeat', payload);
  }

  async stopStructuring(payload: StructuringStopPayload): Promise<StructuringLockResponse> {
    return this.requestJson<StructuringLockResponse>('/structuring/stop', payload);
  }

  private async requestJson<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${getApiBase()}/api/projects/${this.projectId}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = await this.parseJson<ApiErrorEnvelope | T>(response);
    if (!response.ok) {
      const apiError = payload as ApiErrorEnvelope | null;
      throw new ProjectStructuringApiError(
        apiError?.error || apiError?.message || `Request failed with status ${response.status}`,
        response.status,
        apiError?.code ?? null,
        apiError?.details,
      );
    }

    return payload as T;
  }

  private async parseJson<T>(response: Response): Promise<T | null> {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    return (await response.json()) as T;
  }
}