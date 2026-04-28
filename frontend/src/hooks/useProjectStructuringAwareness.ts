import { useEffect, useMemo, useRef, useState } from 'react';
import type { StructuringDrainEvent } from 'shared/structuring-events';
import {
  ProjectStructuringApiError,
  ProjectStructuringService,
  type ProjectPresenceMode,
} from '../services/ProjectStructuringService';
import {
  StructuringEventsService,
  type StructuringRealtimeState,
} from '../services/StructuringEventsService';

function createClientInstanceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  const clientInstanceIdRef = useRef(createClientInstanceId());
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
      clientInstanceId: clientInstanceIdRef.current,
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