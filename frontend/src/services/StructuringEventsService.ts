import type {
  StructuringDrainEvent,
  StructuringDrainRequest,
  StructuringStreamEvent,
} from 'shared/structuring-events';
import { getApiBase } from '../config/oauth';

export type StructuringRealtimeState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface StructuringEventsHandlers {
  onConnectionStateChange?: (state: StructuringRealtimeState) => void;
  onDrainingStarted?: (event: StructuringDrainEvent) => void;
  onDrainingStopped?: (event: StructuringDrainEvent) => void;
  onReconnect?: () => void;
}

export class StructuringEventsService {
  private eventSource: EventSource | null = null;
  private handlers: StructuringEventsHandlers = {};
  private streamId: string | null = null;
  private hasConnectedOnce = false;
  private closedByClient = false;

  constructor(private readonly projectId: string) {}

  connect(handlers: StructuringEventsHandlers) {
    this.disconnect();

    this.handlers = handlers;
    this.closedByClient = false;
    this.handlers.onConnectionStateChange?.(this.hasConnectedOnce ? 'reconnecting' : 'connecting');

    const url = `${getApiBase()}/api/projects/${this.projectId}/structuring/events`;
    const source = new EventSource(url, { withCredentials: true });
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

    source.addEventListener('structuring.connected', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'structuring.connected') {
        this.streamId = parsed.streamId;
      }
    });

    source.addEventListener('structuring.draining.started', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'structuring.draining.started') {
        this.handlers.onDrainingStarted?.(parsed);
      }
    });

    source.addEventListener('structuring.draining.stopped', (event) => {
      const parsed = this.parseEvent(event);
      if (parsed?.type === 'structuring.draining.stopped') {
        this.handlers.onDrainingStopped?.(parsed);
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

  async notifyDrainingStart(input: Omit<StructuringDrainRequest, 'streamId'> = {}) {
    return this.sendDrainingSignal('/start', input);
  }

  async notifyDrainingStop(input: Omit<StructuringDrainRequest, 'streamId'> = {}) {
    return this.sendDrainingSignal('/stop', input);
  }

  private async sendDrainingSignal(
    suffix: '/start' | '/stop',
    input: { operationType?: string; operationContext?: Record<string, unknown> },
  ) {
    if (!this.streamId) {
      return false;
    }

    const response = await fetch(
      `${getApiBase()}/api/projects/${this.projectId}/structuring/events/draining${suffix}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamId: this.streamId,
          ...input,
        } satisfies StructuringDrainRequest),
      },
    );

    return response.ok;
  }

  private parseEvent(event: MessageEvent) {
    try {
      return JSON.parse(event.data) as StructuringStreamEvent;
    } catch (error) {
      console.error('Failed to parse structuring SSE event:', error);
      return null;
    }
  }
}