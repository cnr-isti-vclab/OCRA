import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ProjectStructuringCoordinator,
  type HeldStructuringLock,
} from '../services/ProjectStructuringCoordinator';
import { ProjectStructuringService } from '../services/ProjectStructuringService';
import { StructuringDrainingNotifier } from '../services/StructuringDrainingNotifier';
import { StructuringEventsService, type StructuringRealtimeState } from '../services/StructuringEventsService';
import { ProjectStructuringApiError } from '../services/ProjectStructuringService';

export type ProjectStructuringStatus = 'inactive' | 'acquiring' | 'draining' | 'exclusive' | 'releasing' | 'canceling';

export interface ProjectStructuringLockState {
  enabled: boolean;
  hasExclusiveLock: boolean;
  status: ProjectStructuringStatus;
  realtimeState: StructuringRealtimeState;
  error: string | null;
}

interface ProjectStructuringLockContextValue {
  getProjectLockState: (projectId?: string) => ProjectStructuringLockState;
  toggleProjectLock: (projectId: string, enabled: boolean) => Promise<void>;
}

interface PendingStructuringAcquisition {
  controller: AbortController;
  promise: Promise<void>;
}

const defaultLockState: ProjectStructuringLockState = {
  enabled: false,
  hasExclusiveLock: false,
  status: 'inactive',
  realtimeState: 'idle',
  error: null,
};

function describeLeaseLost(error: ProjectStructuringApiError) {
  if (error.status === 410 || error.code === 'structuring.lock_missing') {
    return 'The structuring lock expired and was released. You can enable it again.';
  }

  if (error.code === 'structuring.owner_required') {
    return 'The structuring lock is no longer owned by this session. You can enable it again.';
  }

  if (error.code === 'structuring.fencing_token_mismatch') {
    return 'The structuring lock became stale and was released. You can enable it again.';
  }

  return error.message || 'The structuring lock was lost. You can enable it again.';
}

const ProjectStructuringLockContext = createContext<ProjectStructuringLockContextValue | null>(null);

export function ProjectStructuringLockProvider({ children }: { children: ReactNode }) {
  const [lockStateMap, setLockStateMap] = useState<Record<string, ProjectStructuringLockState>>({});
  const eventsRef = useRef<Record<string, StructuringEventsService>>({});
  const coordinatorsRef = useRef<Record<string, ProjectStructuringCoordinator>>({});
  const heldLocksRef = useRef<Record<string, HeldStructuringLock>>({});
  const pendingAcquisitionsRef = useRef<Record<string, PendingStructuringAcquisition>>({});

  const updateProjectLockState = useCallback((projectId: string, partial: Partial<ProjectStructuringLockState>) => {
    setLockStateMap((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] || defaultLockState),
        ...partial,
      },
    }));
  }, []);

  const disposeProjectResources = useCallback((projectId: string) => {
    eventsRef.current[projectId]?.disconnect();
    delete eventsRef.current[projectId];
    delete coordinatorsRef.current[projectId];
  }, []);

  const ensureProjectResources = useCallback((projectId: string) => {
    if (coordinatorsRef.current[projectId] && eventsRef.current[projectId]) {
      return {
        coordinator: coordinatorsRef.current[projectId],
        events: eventsRef.current[projectId],
      };
    }

    const structuringService = new ProjectStructuringService(projectId);
    const events = new StructuringEventsService(projectId);
    const coordinator = new ProjectStructuringCoordinator(projectId, structuringService);

    events.connect({
      onConnectionStateChange: (realtimeState) => {
        updateProjectLockState(projectId, { realtimeState });
      },
    });

    eventsRef.current[projectId] = events;
    coordinatorsRef.current[projectId] = coordinator;
    updateProjectLockState(projectId, { realtimeState: 'connecting' });

    return { coordinator, events };
  }, [updateProjectLockState]);

  const releaseProjectLock = useCallback(async (projectId: string) => {
    const heldLock = heldLocksRef.current[projectId];
    const pendingAcquisition = pendingAcquisitionsRef.current[projectId];
    if (!heldLock && pendingAcquisition) {
      updateProjectLockState(projectId, {
        enabled: true,
        hasExclusiveLock: false,
        status: 'canceling',
        error: null,
      });
      pendingAcquisition.controller.abort();
      await pendingAcquisition.promise;
      return;
    }

    if (!heldLock) {
      disposeProjectResources(projectId);
      updateProjectLockState(projectId, defaultLockState);
      return;
    }

    try {
      updateProjectLockState(projectId, {
        enabled: true,
        hasExclusiveLock: true,
        status: 'releasing',
        error: null,
      });
      await heldLock.release();
    } catch (error) {
      updateProjectLockState(projectId, {
        enabled: true,
        hasExclusiveLock: true,
        status: 'exclusive',
        error: error instanceof Error ? error.message : 'Failed to release structuring lock',
      });
      return;
    }

    delete heldLocksRef.current[projectId];
    disposeProjectResources(projectId);
    updateProjectLockState(projectId, defaultLockState);
  }, [disposeProjectResources, updateProjectLockState]);

  const acquireProjectLock = useCallback(async (projectId: string) => {
    if (heldLocksRef.current[projectId]) {
      updateProjectLockState(projectId, {
        enabled: true,
        hasExclusiveLock: true,
        status: 'exclusive',
        error: null,
      });
      return;
    }

    const existingAcquisition = pendingAcquisitionsRef.current[projectId];
    if (existingAcquisition) {
      await existingAcquisition.promise;
      return;
    }

    const { coordinator, events } = ensureProjectResources(projectId);
    const controller = new AbortController();
    updateProjectLockState(projectId, {
      enabled: true,
      hasExclusiveLock: false,
      status: 'acquiring',
      error: null,
    });

    const acquisitionPromise = (async () => {
      try {
        const drainingNotifier = new StructuringDrainingNotifier(events);
        const heldLock = await coordinator.acquireExclusiveLock({
          operationType: 'project.structuring',
          operationContext: { projectId },
          abortSignal: controller.signal,
          drainingNotifier,
          onStateChange: (lock) => {
            updateProjectLockState(projectId, {
              enabled: true,
              hasExclusiveLock: lock.state === 'exclusive',
              status: lock.state === 'exclusive' ? 'exclusive' : 'draining',
              error: null,
            });
          },
          onLeaseLost: (error) => {
            delete heldLocksRef.current[projectId];
            disposeProjectResources(projectId);
            updateProjectLockState(projectId, {
              enabled: false,
              hasExclusiveLock: false,
              status: 'inactive',
              error: describeLeaseLost(error),
            });
          },
        });

        if (controller.signal.aborted) {
          await heldLock.release().catch(() => {
            // The coordinator already cleaned up the aborted acquisition path.
          });
          return;
        }

        heldLocksRef.current[projectId] = heldLock;
        updateProjectLockState(projectId, {
          enabled: true,
          hasExclusiveLock: true,
          status: 'exclusive',
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          disposeProjectResources(projectId);
          updateProjectLockState(projectId, defaultLockState);
          return;
        }

        disposeProjectResources(projectId);
        updateProjectLockState(projectId, {
          enabled: false,
          hasExclusiveLock: false,
          status: 'inactive',
          error: error instanceof Error ? error.message : 'Failed to acquire structuring lock',
        });
      } finally {
        if (pendingAcquisitionsRef.current[projectId]?.controller === controller) {
          delete pendingAcquisitionsRef.current[projectId];
        }
      }
    })();

    pendingAcquisitionsRef.current[projectId] = {
      controller,
      promise: acquisitionPromise,
    };

    await acquisitionPromise;
  }, [disposeProjectResources, ensureProjectResources, updateProjectLockState]);

  const toggleProjectLock = useCallback(async (projectId: string, enabled: boolean) => {
    if (enabled) {
      await acquireProjectLock(projectId);
      return;
    }

    await releaseProjectLock(projectId);
  }, [acquireProjectLock, releaseProjectLock]);

  useEffect(() => {
    return () => {
      Object.values(pendingAcquisitionsRef.current).forEach((acquisition) => {
        acquisition.controller.abort();
      });
      Object.keys(eventsRef.current).forEach((projectId) => {
        eventsRef.current[projectId]?.disconnect();
      });
    };
  }, []);

  return (
    <ProjectStructuringLockContext.Provider
      value={{
        getProjectLockState: (projectId?: string) => {
          if (!projectId) {
            return defaultLockState;
          }

          return lockStateMap[projectId] || defaultLockState;
        },
        toggleProjectLock,
      }}
    >
      {children}
    </ProjectStructuringLockContext.Provider>
  );
}

export function useProjectStructuringLock() {
  const context = useContext(ProjectStructuringLockContext);
  if (!context) {
    throw new Error('useProjectStructuringLock must be used within ProjectStructuringLockProvider');
  }

  return context;
}
