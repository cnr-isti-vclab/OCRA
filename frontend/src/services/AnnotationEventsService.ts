import type {
  AnnotationConnectedEvent,
  AnnotationSocialLockKind,
  AnnotationEventResourceType,
  AnnotationMutationEvent,
  AnnotationSocialLockEvent,
  AnnotationSocialLockRequest,
  AnnotationStreamEvent,
} from 'shared/annotation-events';
import { appendStoredSessionId, getApiBase } from '../config/oauth';

export type AnnotationRealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface AnnotationEventsHandlers {
  includeSelfEvents?: boolean;
  onConnected?: (event: AnnotationConnectedEvent) => void;
  onConnectionStateChange?: (state: AnnotationRealtimeState) => void;
  onMutation?: (event: AnnotationMutationEvent) => void;
  onReconnect?: () => void;
  onSocialLockStarted?: (event: AnnotationSocialLockEvent) => void;
  onSocialLockStopped?: (event: AnnotationSocialLockEvent) => void;
}

export class AnnotationEventsService {
  private projectId: string;
  private sceneId: string | null;
  private eventSource: EventSource | null = null;
  private handlers: AnnotationEventsHandlers = {};
  private streamId: string | null = null;
  private hasConnectedOnce = false;
  private closedByClient = false;
  private includeSelfEvents = false;
  private localSessionId: string | null = null;

  constructor(projectId: string, sceneId?: string | null) {
    this.projectId = projectId;
    this.sceneId = sceneId ?? null;
  }

  private buildCurlCommand(url: string, payload: AnnotationSocialLockRequest) {
    return `curl -X POST -H "Content-Type: application/json" -H "Cookie: session_id=<session_id>" ${url} -d '${JSON.stringify(payload)}'`;
  }

  private logConnectionInfo(streamId: string) {
    const apiBase = getApiBase();
    const eventsUrl = this.sceneId
      ? `${apiBase}/api/projects/${this.projectId}/annotations/events?sceneId=${encodeURIComponent(this.sceneId)}`
      : `${apiBase}/api/projects/${this.projectId}/annotations/events`;
    const socialLockBaseUrl = `${apiBase}/api/projects/${this.projectId}/annotations/events/social-lock`;
    const socialLockStartUrl = `${socialLockBaseUrl}/start`;
    const socialLockStopUrl = `${socialLockBaseUrl}/stop`;
    const sceneWidePayload = this.sceneId
      ? ({
          streamId,
          lockKind: 'presence',
          originScopeType: 'scene',
          originScopeId: this.sceneId,
          activity: 'external-debug',
        } satisfies AnnotationSocialLockRequest)
      : null;
    const scopedPayload = this.sceneId
      ? ({
          streamId,
          lockKind: 'editor',
          originScopeType: 'scene',
          originScopeId: this.sceneId,
          resourceType: 'geometry',
          resourceId: '<geometry-id>',
          activity: 'external-debug',
        } satisfies AnnotationSocialLockRequest)
      : null;
    const startSceneWideCurl = sceneWidePayload ? this.buildCurlCommand(socialLockStartUrl, sceneWidePayload) : null;
    const startScopedCurl = scopedPayload ? this.buildCurlCommand(socialLockStartUrl, scopedPayload) : null;
    const stopScopedCurl = scopedPayload ? this.buildCurlCommand(socialLockStopUrl, scopedPayload) : null;

    console.log('[Annotation SSE] Connected', {
      apiBase,
      projectId: this.projectId,
      sceneId: this.sceneId,
      streamId,
      eventsUrl,
      socialLockStartUrl,
      socialLockStopUrl,
      validResourceTypes: ['geometry', 'data', 'link'],
      note: 'The stream is project-wide when sceneId is omitted. If sceneId is provided, the server filters deliveries to impacted scenes. originScopeType/originScopeId declare what is being edited; resourceType/resourceId remain optional but must be paired when present.',
      socialLockSceneWidePayloadExample: sceneWidePayload,
      socialLockScopedPayloadExample: scopedPayload,
      fetchExamples: sceneWidePayload && scopedPayload
        ? {
            startSceneWide: {
              method: 'POST',
              url: socialLockStartUrl,
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sceneWidePayload),
            },
            startScoped: {
              method: 'POST',
              url: socialLockStartUrl,
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(scopedPayload),
            },
            stopScoped: {
              method: 'POST',
              url: socialLockStopUrl,
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(scopedPayload),
            },
          }
        : null,
      curlExamples: {
        startSceneWide: startSceneWideCurl,
        startScoped: startScopedCurl,
        stopScoped: stopScopedCurl,
      },
    });

    if (startSceneWideCurl && startScopedCurl && stopScopedCurl) {
      console.log('[Annotation SSE] Copy/paste curl startSceneWide');
      console.log(startSceneWideCurl);
      console.log('[Annotation SSE] Copy/paste curl startScoped');
      console.log(startScopedCurl);
      console.log('[Annotation SSE] Copy/paste curl stopScoped');
      console.log(stopScopedCurl);
    }
  }

  private logSocialLockEvent(event: AnnotationSocialLockEvent) {
    console.log(`[Annotation SSE] ${event.type}`, {
      projectId: event.projectId,
      sceneId: event.sceneId,
      impact: event.impact,
      streamId: event.streamId,
      sessionId: event.sessionId,
      userId: event.userId,
      username: event.username,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      activity: event.activity,
      startedAt: event.startedAt,
      timestamp: event.timestamp,
      isCurrentStream: event.streamId === this.streamId,
    });
  }

  private logMutationEvent(event: AnnotationMutationEvent) {
    console.log('[Annotation SSE] annotation.mutated', {
      projectId: event.projectId,
      sceneId: event.sceneId,
      impact: event.impact,
      sessionId: event.sessionId,
      userId: event.userId,
      username: event.username,
      mutation: event.mutation,
      entity: event.entity,
      timestamp: event.timestamp,
    });
  }

  connect(handlers: AnnotationEventsHandlers) {
    this.disconnect();

    this.handlers = handlers;
    this.includeSelfEvents = handlers.includeSelfEvents ?? false;
    this.closedByClient = false;
    this.localSessionId = this.readStoredSessionId();
    this.handlers.onConnectionStateChange?.(this.hasConnectedOnce ? 'reconnecting' : 'connecting');

    const url = new URL(`${getApiBase()}/api/projects/${this.projectId}/annotations/events`);
    if (this.sceneId) {
      url.searchParams.set('sceneId', this.sceneId);
    }

    appendStoredSessionId(url);

    const source = new EventSource(url.toString(), { withCredentials: true });
    this.eventSource = source;

    source.onopen = () => {
      const wasReconnect = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      this.handlers.onConnectionStateChange?.('connected');
      if (wasReconnect) {
        this.handlers.onReconnect?.();
      }
    };

    source.onerror = () => {
      if (this.closedByClient) {
        this.handlers.onConnectionStateChange?.('idle');
        return;
      }

      this.handlers.onConnectionStateChange?.(this.hasConnectedOnce ? 'reconnecting' : 'error');
    };

    source.addEventListener('annotation.connected', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'annotation.connected') {
        this.streamId = parsed.streamId;
        this.logConnectionInfo(parsed.streamId);
        this.handlers.onConnected?.(parsed);
      }
    });

    source.addEventListener('annotation.mutated', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'annotation.mutated') {
        // Comment next lines To always deliver mutations to every subscribed tab, including tabs that share
        // one authenticated session. AnnotationStore dedupes via version guards; the
        // legacy session filter hid cross-tab updates during multi-tab editing.
        if (!this.shouldDispatchForSession(parsed.sessionId)) {
          return;
        }

        this.logMutationEvent(parsed);
        this.handlers.onMutation?.(parsed);
      }
    });

    source.addEventListener('annotation.social_lock.started', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'annotation.social_lock.started') {
        if (!this.shouldDispatchSocialLockForSession(parsed)) {
          return;
        }

        this.logSocialLockEvent(parsed);
        this.handlers.onSocialLockStarted?.(parsed);
      }
    });

    source.addEventListener('annotation.social_lock.stopped', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'annotation.social_lock.stopped') {
        if (!this.shouldDispatchSocialLockForSession(parsed)) {
          return;
        }

        this.logSocialLockEvent(parsed);
        this.handlers.onSocialLockStopped?.(parsed);
      }
    });
  }

  disconnect() {
    this.closedByClient = true;
    this.streamId = null;
    this.includeSelfEvents = false;
    this.localSessionId = null;
    this.eventSource?.close();
    this.eventSource = null;
    this.handlers.onConnectionStateChange?.('idle');
  }

  private readStoredSessionId() {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage.getItem('oauth_session_id');
  }

  private shouldDispatchForSession(eventSessionId: string) {
    if (this.includeSelfEvents || !this.localSessionId) {
      return true;
    }

    return eventSessionId !== this.localSessionId;
  }
  
  private shouldDispatchSocialLockForSession(event: AnnotationSocialLockEvent) {
    if (this.includeSelfEvents || !this.localSessionId) {
      return true;
    }

    if (event.sessionId !== this.localSessionId) {
      return true;
    }

    // Ignore only events echoed back to the same stream, but keep social-lock
    // visibility across tabs/windows that share one authenticated session.
    return event.streamId !== this.streamId;
  }

  async notifyEditingStart(input: Omit<AnnotationSocialLockRequest, 'sceneId' | 'streamId'> = {}) {
    return this.sendSocialLock('/start', input);
  }

  async notifyEditingStop(input: Omit<AnnotationSocialLockRequest, 'sceneId' | 'streamId'> = {}) {
    return this.sendSocialLock('/stop', input);
  }

  async notifyPresenceStart(input: Omit<AnnotationSocialLockRequest, 'sceneId' | 'streamId' | 'lockKind' | 'resourceType' | 'resourceId'> = {}) {
    return this.sendSocialLock('/start', {
      ...input,
      lockKind: 'presence',
    });
  }

  async notifyPresenceStop(input: Omit<AnnotationSocialLockRequest, 'sceneId' | 'streamId' | 'lockKind' | 'resourceType' | 'resourceId'> = {}) {
    return this.sendSocialLock('/stop', {
      ...input,
      lockKind: 'presence',
    });
  }

  async notifyEditorStart(input: Omit<AnnotationSocialLockRequest, 'sceneId' | 'streamId' | 'lockKind'> & {
    resourceType: AnnotationEventResourceType;
    resourceId: string;
  }) {
    return this.sendSocialLock('/start', {
      ...input,
      lockKind: 'editor',
    });
  }

  async notifyEditorStop(input: Omit<AnnotationSocialLockRequest, 'sceneId' | 'streamId' | 'lockKind'> & {
    resourceType: AnnotationEventResourceType;
    resourceId: string;
  }) {
    return this.sendSocialLock('/stop', {
      ...input,
      lockKind: 'editor',
    });
  }

  private async sendSocialLock(
    suffix: '/start' | '/stop',
    input: {
      lockKind?: AnnotationSocialLockKind;
      originScopeType?: 'scene' | 'asset';
      originScopeId?: string;
      resourceType?: AnnotationEventResourceType;
      resourceId?: string;
      activity?: string;
    },
  ) {
    if (!this.streamId) {
      return false;
    }

    const originScopeType = input.originScopeType ?? (this.sceneId ? 'scene' : undefined);
    const originScopeId = input.originScopeId ?? this.sceneId ?? undefined;
    if (!originScopeType || !originScopeId) {
      return false;
    }

    const response = await fetch(
      `${getApiBase()}/api/projects/${this.projectId}/annotations/events/social-lock${suffix}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamId: this.streamId,
          originScopeType,
          originScopeId,
          ...input,
        } satisfies AnnotationSocialLockRequest),
      },
    );

    return response.ok;
  }

  private parseEvent(event: Event): AnnotationStreamEvent | null {
    if (!(event instanceof MessageEvent) || typeof event.data !== 'string') {
      return null;
    }

    try {
      return JSON.parse(event.data) as AnnotationStreamEvent;
    } catch (error) {
      console.error('Failed to parse annotation SSE event:', error);
      return null;
    }
  }
}