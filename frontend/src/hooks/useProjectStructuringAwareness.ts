import { useEffect, useMemo, useRef, useState } from 'react';
import type { StructuringDrainEvent, StructuringDrainState } from 'shared/structuring-events';
import {
  ProjectStructuringApiError,
  ProjectStructuringService,
  type ProjectPresenceMode,
} from '../services/ProjectStructuringService';
import {
  StructuringEventsService,
  type StructuringRealtimeState,
} from '../services/StructuringEventsService';

function generateId() {
  return crypto.randomUUID?.() ?? `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getOrCreateClientInstanceId(mode: ProjectPresenceMode, sceneId?: string | null): string {
  const key = `ocra:presence:${mode}:${sceneId ?? '-'}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = generateId();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    return generateId();
  }
}

function toActiveDrainingEvent(signal: StructuringDrainState): StructuringDrainEvent {
  return {
    ...signal,
    type: 'structuring.draining.started',
    timestamp: signal.startedAt,
  };
}

interface UseProjectStructuringAwarenessOptions {
  projectId?: string;
  mode: ProjectPresenceMode;
  sceneId?: string | null;
  enabled?: boolean;
}

export function useProjectStructuringAwareness({
  projectId,
  mode,
  sceneId,
  enabled = true,
}: UseProjectStructuringAwarenessOptions) {
  const [structuringRealtimeState, setStructuringRealtimeState] = useState<StructuringRealtimeState>('idle');
  const [activeDrainingEvent, setActiveDrainingEvent] = useState<StructuringDrainEvent | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const clientInstanceId = useMemo(() => getOrCreateClientInstanceId(mode, sceneId), [mode, sceneId]);
  const retryPresenceTimeoutRef = useRef<number | null>(null);

  const structuringService = useMemo(
    () => (projectId ? new ProjectStructuringService(projectId) : null),
    [projectId],
  );

  useEffect(() => {
    if (!enabled || !projectId || !structuringService) {
      setStructuringRealtimeState('idle');
      setActiveDrainingEvent(null);
      setPresenceError(null);
      return;
    }

    let disposed = false;
    const eventsService = new StructuringEventsService(projectId);
    const presencePayload = {
      mode,
      sceneId: sceneId ?? undefined,
      clientInstanceId,
    };

    const clearRetryPresenceTimer = () => {
      if (retryPresenceTimeoutRef.current !== null) {
        window.clearTimeout(retryPresenceTimeoutRef.current);
        retryPresenceTimeoutRef.current = null;
      }
    };

    const startPresence = async () => {
      try {
        setPresenceError(null);
        await structuringService.startPresence(presencePayload);
        clearRetryPresenceTimer();
      } catch (error) {
        if (disposed) {
          return;
        }

        if (error instanceof ProjectStructuringApiError && error.status === 423) {
          setPresenceError('Another user is structuring this project. This project is temporarily unavailable, but you can continue working on other projects.');
          return;
        }

        setPresenceError(error instanceof Error ? error.message : 'Failed to register project presence');
      }
    };

    const schedulePresenceRetry = (delayMs = 1_000) => {
      if (disposed || retryPresenceTimeoutRef.current !== null) {
        return;
      }

      retryPresenceTimeoutRef.current = window.setTimeout(() => {
        retryPresenceTimeoutRef.current = null;
        void startPresence();
      }, delayMs);
    };

    const heartbeatPresence = async () => {
      try {
        await structuringService.heartbeatPresence(presencePayload);
        if (presenceError) {
          setPresenceError(null);
        }
      } catch (error) {
        if (disposed) {
          return;
        }

        if (error instanceof ProjectStructuringApiError && error.status === 423) {
          setPresenceError('Project draining is in progress. This project is temporarily unavailable, but you can continue working on other projects.');
          return;
        }

        console.error('Project presence heartbeat failed:', error);
      }
    };

    eventsService.connect({
      onConnectionStateChange: setStructuringRealtimeState,
      onConnected: (event) => {
        const latestSignal = [...event.activeDrainingSignals]
          .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0];

        setActiveDrainingEvent(latestSignal ? toActiveDrainingEvent(latestSignal) : null);
      },
      onDrainingStarted: (event) => {
        setActiveDrainingEvent(event);
      },
      onDrainingStopped: () => {
        setActiveDrainingEvent(null);
        setPresenceError(null);
        schedulePresenceRetry();
      },
      onReconnect: () => {
        if (!activeDrainingEvent) {
          schedulePresenceRetry();
        }
      },
    });

    void startPresence();
    const heartbeatTimer = window.setInterval(() => {
      void heartbeatPresence();
    }, 10_000);

    return () => {
      disposed = true;
      clearRetryPresenceTimer();
      window.clearInterval(heartbeatTimer);
      eventsService.disconnect();
      void structuringService.stopPresence(presencePayload).catch((error) => {
        console.debug('Project presence stop failed during cleanup:', error);
      });
    };
  }, [enabled, mode, projectId, sceneId, structuringService]);

  return {
    structuringRealtimeState,
    activeDrainingEvent,
    presenceError,
    clearDrainingEvent: () => setActiveDrainingEvent(null),
  };
}