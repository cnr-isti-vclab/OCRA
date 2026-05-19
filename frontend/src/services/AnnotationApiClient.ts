import type {
  AnnotationConnectedEvent,
  AnnotationEventResourceType,
  AnnotationMutationEvent,
  AnnotationSocialLockKind,
  AnnotationSocialLockEvent,
} from 'shared/annotation-events';
import type {
  AnnotationData,
  AnnotationGeometry,
  AnnotationLink,
  AnnotationScopeType,
  AnnotationShape,
} from 'shared/annotation-types';
import { getApiBase } from '../config/oauth';
import {
  AnnotationEventsService,
  type AnnotationRealtimeState,
} from './AnnotationEventsService';

export interface AnnotationSceneBundle {
  geometries: AnnotationGeometry[];
  data: AnnotationData[];
  links: AnnotationLink[];
}

export interface AnnotationEntityTriple {
  geometry: AnnotationGeometry;
  datum: AnnotationData;
  link: AnnotationLink;
}

interface AnnotationApiClientOptions {
  projectId: string;
  sceneId: string;
}

interface AnnotationRealtimeHandlers {
  onConnected?: (event: AnnotationConnectedEvent) => void;
  onConnectionStateChange?: (state: AnnotationRealtimeState) => void;
  onMutation?: (event: AnnotationMutationEvent) => void;
  onReconnect?: () => void;
  onSocialLockStarted?: (event: AnnotationSocialLockEvent) => void;
  onSocialLockStopped?: (event: AnnotationSocialLockEvent) => void;
}

interface CreateGeometryInput {
  shapes: AnnotationShape[];
  referenceType: AnnotationScopeType;
  referenceId: string;
}

interface UpdateGeometryInput {
  expectedVersion: number;
  shapes: AnnotationShape[];
}

interface CreateDataInput {
  label: string;
  description?: string;
  class: string | null;
  content: Record<string, unknown>;
  visibilityType: AnnotationScopeType;
  visibilityId: string;
}

interface UpdateDataInput {
  expectedVersion: number;
  label?: string;
  description?: string;
  class?: string | null;
  content?: Record<string, unknown>;
}

interface CreateLinkInput {
  geometryId: string;
  dataId: string;
}

interface SocialLockInput {
  lockKind?: AnnotationSocialLockKind;
  originScopeType?: 'scene' | 'asset';
  originScopeId?: string;
  resourceType?: AnnotationEventResourceType;
  resourceId?: string;
  activity?: string;
}

interface SuccessEnvelope {
  success: true;
}

interface SceneBundleEnvelope extends SuccessEnvelope {
  geometries: AnnotationGeometry[];
  data: AnnotationData[];
  links: AnnotationLink[];
}

interface GeometryEnvelope extends SuccessEnvelope {
  geometry: AnnotationGeometry;
}

interface DataEnvelope extends SuccessEnvelope {
  datum: AnnotationData;
}

interface LinkEnvelope extends SuccessEnvelope {
  link: AnnotationLink;
}

interface GeometriesEnvelope extends SuccessEnvelope {
  geometries: AnnotationGeometry[];
}

interface DataListEnvelope extends SuccessEnvelope {
  data: AnnotationData[];
}

interface LinksEnvelope extends SuccessEnvelope {
  links: AnnotationLink[];
}

export class AnnotationApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AnnotationApiError';
    this.status = status;
    this.code = code;
  }
}

export class AnnotationApiClient {
  readonly projectId: string;
  readonly sceneId: string;
  private readonly events: AnnotationEventsService;

  constructor(options: AnnotationApiClientOptions) {
    this.projectId = options.projectId;
    this.sceneId = options.sceneId;
    this.events = new AnnotationEventsService(options.projectId, options.sceneId);
  }

  connectRealtime(handlers: AnnotationRealtimeHandlers) {
    this.events.connect(handlers);
  }

  disconnectRealtime() {
    this.events.disconnect();
  }

  async loadSceneBundle(includeErasable = true) {
    const query = new URLSearchParams();
    query.set('sceneId', this.sceneId);
    if (includeErasable) {
      query.set('includeErasable', 'true');
    }
    const response = await this.request<SceneBundleEnvelope>(
      `/annotations?${query.toString()}`,
    );

    return {
      geometries: response.geometries,
      data: response.data,
      links: response.links,
    } satisfies AnnotationSceneBundle;
  }

  async loadSceneGeometries(includeErasable = true) {
    const query = new URLSearchParams();
    query.set('sceneId', this.sceneId);
    if (includeErasable) {
      query.set('includeErasable', 'true');
    }
    const response = await this.request<GeometriesEnvelope>(
      `/annotations/geometry?${query.toString()}`,
    );

    return response.geometries;
  }

  async loadSceneData(includeErasable = true) {
    const query = new URLSearchParams();
    query.set('sceneId', this.sceneId);
    if (includeErasable) {
      query.set('includeErasable', 'true');
    }
    const response = await this.request<DataListEnvelope>(
      `/annotations/data?${query.toString()}`,
    );

    return response.data;
  }

  /** Project-wide data list (no sceneId filter). Used by on-demand link pickers. */
  async loadAllData(includeErasable = true) {
    const query = new URLSearchParams();
    if (includeErasable) {
      query.set('includeErasable', 'true');
    }
    const suffix = query.toString();
    const response = await this.request<DataListEnvelope>(
      `/annotations/data${suffix ? `?${suffix}` : ''}`,
    );

    return response.data;
  }

  async loadSceneLinks(includeErasable = true) {
    const query = new URLSearchParams();
    query.set('sceneId', this.sceneId);
    if (includeErasable) {
      query.set('includeErasable', 'true');
    }
    const response = await this.request<LinksEnvelope>(
      `/annotations/links?${query.toString()}`,
    );

    return response.links;
  }

  async getGeometry(geometryId: string, includeErasable = true) {
    const query = includeErasable ? '?includeErasable=true' : '';
    const response = await this.request<GeometryEnvelope>(
      `/annotations/geometry/${geometryId}${query}`,
    );

    return response.geometry;
  }

  async getData(dataId: string, includeErasable = true) {
    const query = includeErasable ? '?includeErasable=true' : '';
    const response = await this.request<DataEnvelope>(
      `/annotations/data/${dataId}${query}`,
    );

    return response.datum;
  }

  async getLink(linkId: string, includeErasable = true) {
    const query = includeErasable ? '?includeErasable=true' : '';
    const response = await this.request<LinkEnvelope>(
      `/annotations/links/${linkId}${query}`,
    );

    return response.link;
  }

  async createGeometry(input: CreateGeometryInput) {
    const response = await this.request<GeometryEnvelope>('/annotations/geometry', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return response.geometry;
  }

  async updateGeometry(geometryId: string, input: UpdateGeometryInput) {
    return this.request<{ success: true; version: number; updatedAt: string | null }>(
      `/annotations/geometry/${geometryId}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    );
  }

  async markGeometryErasable(geometryId: string, expectedVersion: number) {
    return this.request<{ success: true; version: number; updatedAt: string | null }>(
      `/annotations/geometry/${geometryId}/erasable`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion }),
      },
    );
  }

  async markGeometryNonErasable(geometryId: string, expectedVersion: number) {
    return this.request<{ success: true; version: number; updatedAt: string | null }>(
      `/annotations/geometry/${geometryId}/nonerasable`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion }),
      },
    );
  }

  async createData(input: CreateDataInput) {
    const response = await this.request<DataEnvelope>('/annotations/data', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return response.datum;
  }

  async updateData(dataId: string, input: UpdateDataInput) {
    return this.request<{ success: true; version: number; updatedAt: string | null }>(
      `/annotations/data/${dataId}`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    );
  }

  async markDataErasable(dataId: string, expectedVersion: number) {
    return this.request<{ success: true; version: number; updatedAt: string | null }>(
      `/annotations/data/${dataId}/erasable`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion }),
      },
    );
  }

  async markDataNonErasable(dataId: string, expectedVersion: number) {
    return this.request<{ success: true; version: number; updatedAt: string | null }>(
      `/annotations/data/${dataId}/nonerasable`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion }),
      },
    );
  }

  async createLink(input: CreateLinkInput) {
    const response = await this.request<LinkEnvelope>('/annotations/links', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return response.link;
  }

  async createSceneAnnotation(input: {
    shapes: AnnotationShape[];
    label: string;
    description?: string;
    class: string | null;
    content: Record<string, unknown>;
  }) {
    const geometry = await this.createGeometry({
      shapes: input.shapes,
      referenceType: 'scene',
      referenceId: this.sceneId,
    });

    const datum = await this.createData({
      label: input.label,
      description: input.description,
      class: input.class,
      content: input.content,
      visibilityType: 'scene',
      visibilityId: this.sceneId,
    });

    const link = await this.createLink({
      geometryId: geometry.id,
      dataId: datum.id,
    });

    return {
      geometry,
      datum,
      link,
    } satisfies AnnotationEntityTriple;
  }

  async markLinkErasable(linkId: string, expectedVersion: number) {
    return this.request<{ success: true; version: number; updatedAt: string | null }>(
      `/annotations/links/${linkId}/erasable`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion }),
      },
    );
  }

  async markLinkNonErasable(linkId: string, expectedVersion: number) {
    return this.request<{ success: true; version: number; updatedAt: string | null }>(
      `/annotations/links/${linkId}/nonerasable`,
      {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion }),
      },
    );
  }

  async notifySocialLockStart(input: SocialLockInput = {}) {
    return this.events.notifyEditingStart(input);
  }

  async notifySocialLockStop(input: SocialLockInput = {}) {
    return this.events.notifyEditingStop(input);
  }

  async notifyPresenceStart(input: Omit<SocialLockInput, 'lockKind' | 'resourceType' | 'resourceId'> = {}) {
    return this.events.notifyPresenceStart(input);
  }

  async notifyPresenceStop(input: Omit<SocialLockInput, 'lockKind' | 'resourceType' | 'resourceId'> = {}) {
    return this.events.notifyPresenceStop(input);
  }

  async notifyEditorLockStart(input: Omit<SocialLockInput, 'lockKind'> & {
    resourceType: AnnotationEventResourceType;
    resourceId: string;
  }) {
    return this.events.notifyEditorStart(input);
  }

  async notifyEditorLockStop(input: Omit<SocialLockInput, 'lockKind'> & {
    resourceType: AnnotationEventResourceType;
    resourceId: string;
  }) {
    return this.events.notifyEditorStop(input);
  }

  private async request<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(`${getApiBase()}/api/projects/${this.projectId}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const { message, code } = await this.extractError(response);
      throw new AnnotationApiError(message, response.status, code);
    }

    return (await response.json()) as T;
  }

  private async extractError(response: Response): Promise<{ message: string; code?: string }> {
    try {
      const payload = await response.json() as { error?: string; message?: string; code?: string };
      return {
        message: payload.message || payload.error || payload.code || `Request failed with status ${response.status}`,
        code: payload.code,
      };
    } catch {
      return { message: `Request failed with status ${response.status}` };
    }
  }
}

export function buildReadableSocialLockMessage(event: AnnotationSocialLockEvent, currentSceneId?: string | null) {
  const lockKindLabel = event.lockKind === 'editor' ? 'annotation editor' : 'annotation presence';
  const scope = event.impact.originScopeType === 'scene'
    ? event.impact.originScopeId === currentSceneId
      ? 'this scene'
      : `scene ${event.impact.originScopeId}`
    : event.impact.originScopeType === 'asset'
      ? `asset ${event.impact.originScopeId}`
      : 'multiple shared scopes';
  const resource = event.resourceType && event.resourceId
    ? `${event.resourceType} ${event.resourceId}`
    : 'scene-wide annotations';
  const activity = event.activity ? ` while ${event.activity}` : '';
  const impact = currentSceneId && event.impact.affectedSceneIds.includes(currentSceneId)
    ? ' affecting this scene'
    : event.impact.affectedSceneIds.length > 0
      ? ` affecting scenes ${event.impact.affectedSceneIds.join(', ')}`
      : event.impact.affectedAssetIds.length > 0
        ? ` affecting assets ${event.impact.affectedAssetIds.join(', ')}`
        : '';

  return `${event.username} ${event.type === 'annotation.social_lock.started' ? 'started' : 'stopped'} ${lockKindLabel} on ${resource} in ${scope}${impact}${activity}.`;
}

export function buildReadableMutationMessage(event: AnnotationMutationEvent, currentSceneId?: string | null) {
  const scope = event.impact.originScopeType === 'scene'
    ? event.impact.originScopeId === currentSceneId
      ? 'this scene'
      : `scene ${event.impact.originScopeId}`
    : event.impact.originScopeType === 'asset'
      ? `asset ${event.impact.originScopeId}`
      : 'multiple shared scopes';
  const impact = currentSceneId && event.impact.affectedSceneIds.includes(currentSceneId)
    ? ' affecting this scene'
    : event.impact.affectedSceneIds.length > 0
      ? ` affecting scenes ${event.impact.affectedSceneIds.join(', ')}`
      : event.impact.affectedAssetIds.length > 0
        ? ` affecting assets ${event.impact.affectedAssetIds.join(', ')}`
        : '';

  return `${event.username} published ${event.mutation} on ${event.entity.kind} ${event.entity.id} in ${scope}${impact}.`;
}