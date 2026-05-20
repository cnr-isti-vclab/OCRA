import type { StructuringDrainEvent } from 'shared/structuring-events';
import { StructuringEventsService } from './StructuringEventsService';
import type { StructuringDrainSignal, StructuringDrainingNotifier } from './ProjectStructuringCoordinator';

export function isStructuringDrainingEvent(event: StructuringDrainEvent) {
  return event.type === 'structuring.draining.started' || event.type === 'structuring.draining.stopped';
}

export class StructuringDrainingNotifier implements StructuringDrainingNotifier {
  constructor(private readonly structuringEvents: StructuringEventsService) {}

  async notifyDrainingStart(signal: StructuringDrainSignal) {
    return this.structuringEvents.notifyDrainingStart({
      operationType: signal.operationType,
      operationContext: signal.operationContext,
      drainTimeoutMs: signal.drainTimeoutMs,
      drainDeadlineAt: signal.drainDeadlineAt ?? undefined,
    });
  }

  async notifyDrainingStop(signal: StructuringDrainSignal) {
    return this.structuringEvents.notifyDrainingStop({
      operationType: signal.operationType,
      operationContext: signal.operationContext,
    });
  }
}