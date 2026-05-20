export interface StructuringDrainState {
  streamId: string;
  projectId: string;
  sessionId: string;
  userId: string;
  username: string;
  operationType: string | null;
  operationContext: Record<string, unknown> | null;
  startedAt: string;
  drainDeadlineAt: string | null;
}

export interface StructuringConnectedEvent {
  type: 'structuring.connected';
  timestamp: string;
  streamId: string;
  projectId: string;
  activeDrainingSignals: StructuringDrainState[];
}

export interface StructuringDrainEvent extends StructuringDrainState {
  type: 'structuring.draining.started' | 'structuring.draining.stopped';
  timestamp: string;
}

export type StructuringStreamEvent = StructuringConnectedEvent | StructuringDrainEvent;

export interface StructuringDrainRequest {
  streamId: string;
  operationType?: string;
  operationContext?: Record<string, unknown>;
  drainTimeoutMs?: number;
  drainDeadlineAt?: string;
}

export interface StructuringDrainResponse {
  success: true;
  event: StructuringDrainEvent;
}