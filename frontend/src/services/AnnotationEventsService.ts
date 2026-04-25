import type {
  AnnotationEventResourceType,
  AnnotationMutationEvent,
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
      }
    });

    source.addEventListener('annotation.mutated', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'annotation.mutated') {
        this.handlers.onMutation?.(parsed);
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