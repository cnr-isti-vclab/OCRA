import type {
  AnnotationEventResourceType,
  AnnotationMutationEvent,
  AnnotationSocialLockEvent,
  AnnotationSocialLockRequest,
  AnnotationStreamEvent,
} from 'shared/annotation-events';
import { getApiBase } from '../config/oauth';

export type AnnotationRealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface AnnotationEventsHandlers {
  onConnectionStateChange?: (state: AnnotationRealtimeState) => void;
  onMutation?: (event: AnnotationMutationEvent) => void;
  onReconnect?: () => void;
}

export class AnnotationEventsService {
  private projectId: string;
  private sceneId: string;
  private eventSource: EventSource | null = null;
  private handlers: AnnotationEventsHandlers = {};
  private streamId: string | null = null;
  private hasConnectedOnce = false;
  private closedByClient = false;

  constructor(projectId: string, sceneId: string) {
    this.projectId = projectId;
    this.sceneId = sceneId;
  }

  private buildCurlCommand(url: string, payload: AnnotationSocialLockRequest) {
    return `curl -X POST -H "Content-Type: application/json" -H "Cookie: session_id=<session_id>" ${url} -d '${JSON.stringify(payload)}'`;
  }

  private logConnectionInfo(streamId: string) {
    const apiBase = getApiBase();
    const eventsUrl = `${apiBase}/api/projects/${this.projectId}/annotations/events?sceneId=${encodeURIComponent(this.sceneId)}`;
    const socialLockBaseUrl = `${apiBase}/api/projects/${this.projectId}/annotations/events/social-lock`;
    const scopedPayload = {
      sceneId: this.sceneId,
      streamId,
      resourceType: 'geometry',
      resourceId: '<geometry-id>',
      activity: 'external-debug',
    } satisfies AnnotationSocialLockRequest;
    const sceneWidePayload = {
      sceneId: this.sceneId,
      streamId,
      activity: 'external-debug',
    } satisfies AnnotationSocialLockRequest;
    const socialLockStartUrl = `${socialLockBaseUrl}/start`;
    const socialLockStopUrl = `${socialLockBaseUrl}/stop`;
    const startSceneWideCurl = this.buildCurlCommand(socialLockStartUrl, sceneWidePayload);
    const startScopedCurl = this.buildCurlCommand(socialLockStartUrl, scopedPayload);
    const stopScopedCurl = this.buildCurlCommand(socialLockStopUrl, scopedPayload);

    console.log('[Annotation SSE] Connected', {
      apiBase,
      projectId: this.projectId,
      sceneId: this.sceneId,
      streamId,
      eventsUrl,
      socialLockStartUrl,
      socialLockStopUrl,
      validResourceTypes: ['geometry', 'data', 'link'],
      note: 'resourceType/resourceId are optional, but if one is present both must be present',
      socialLockSceneWidePayloadExample: sceneWidePayload,
      socialLockScopedPayloadExample: scopedPayload,
      fetchExamples: {
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
      },
      curlExamples: {
        startSceneWide: startSceneWideCurl,
        startScoped: startScopedCurl,
        stopScoped: stopScopedCurl,
      },
    });

    console.log('[Annotation SSE] Copy/paste curl startSceneWide');
    console.log(startSceneWideCurl);
    console.log('[Annotation SSE] Copy/paste curl startScoped');
    console.log(startScopedCurl);
    console.log('[Annotation SSE] Copy/paste curl stopScoped');
    console.log(stopScopedCurl);
  }

  private logSocialLockEvent(event: AnnotationSocialLockEvent) {
    console.log(`[Annotation SSE] ${event.type}`, {
      projectId: event.projectId,
      sceneId: event.sceneId,
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
    this.closedByClient = false;
    this.handlers.onConnectionStateChange?.(this.hasConnectedOnce ? 'reconnecting' : 'connecting');

    const url = new URL(`${getApiBase()}/api/projects/${this.projectId}/annotations/events`);
    if (this.sceneId) {
      url.searchParams.set('sceneId', this.sceneId);
    }

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
      }
    });

    source.addEventListener('annotation.mutated', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'annotation.mutated') {
        this.logMutationEvent(parsed);
        this.handlers.onMutation?.(parsed);
      }
    });

    source.addEventListener('annotation.social_lock.started', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'annotation.social_lock.started') {
        this.logSocialLockEvent(parsed);
      }
    });

    source.addEventListener('annotation.social_lock.stopped', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'annotation.social_lock.stopped') {
        this.logSocialLockEvent(parsed);
      }
    });
  }

  disconnect() {
    this.closedByClient = true;
    this.streamId = null;
    this.eventSource?.close();
    this.eventSource = null;
    this.handlers.onConnectionStateChange?.('idle');
  }

  async notifyEditingStart(input: Omit<AnnotationSocialLockRequest, 'sceneId' | 'streamId'> = {}) {
    return this.sendSocialLock('/start', input);
  }

  async notifyEditingStop(input: Omit<AnnotationSocialLockRequest, 'sceneId' | 'streamId'> = {}) {
    return this.sendSocialLock('/stop', input);
  }

  private async sendSocialLock(
    suffix: '/start' | '/stop',
    input: { resourceType?: AnnotationEventResourceType; resourceId?: string; activity?: string },
  ) {
    if (!this.streamId) {
      return false;
    }

    const response = await fetch(
      `${getApiBase()}/api/projects/${this.projectId}/annotations/events/social-lock${suffix}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId: this.sceneId,
          streamId: this.streamId,
          ...input,
        } satisfies AnnotationSocialLockRequest),
      },
    );

    return response.ok;
  }

  private parseEvent(event: MessageEvent) {
    try {
      return JSON.parse(event.data) as AnnotationStreamEvent;
    } catch (error) {
      console.error('Failed to parse annotation SSE event:', error);
      return null;
    }
  }
}