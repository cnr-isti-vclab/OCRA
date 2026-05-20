import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AnnotationConnectedEvent,
  AnnotationMutationEvent,
  AnnotationSocialLockEvent,
} from 'shared/annotation-events';
import type {
  AnnotationData,
  AnnotationGeometry,
  AnnotationLink,
} from 'shared/annotation-types';
import type { AnnotationRealtimeState } from '../services/AnnotationEventsService';
import {
  AnnotationStore,
  createAnnotationStore,
  type CreateAnnotationInput,
  type UpdateDataInput,
} from '../stores/AnnotationStore';

export type AnnotationStoreLogTone = 'info' | 'success' | 'warning' | 'error';

export interface AnnotationStoreLogEntry {
  id: string;
  tone: AnnotationStoreLogTone;
  timestamp: string;
  message: string;
}

interface AnnotationStoreContextValue {
  store: AnnotationStore | null;
  revision: number;
  geometries: AnnotationGeometry[];
  data: AnnotationData[];
  links: AnnotationLink[];
  realtimeState: AnnotationRealtimeState;
  loadingAdditionalData: boolean;
  creating: boolean;
  eventLog: AnnotationStoreLogEntry[];
  clearEventLog: () => void;
  loadScene: (sceneId: string) => Promise<void>;
  updateGeometry: (geometryId: string, shapes: CreateAnnotationInput['shapes']) => Promise<void>;
  updateData: (dataId: string, input: UpdateDataInput) => Promise<void>;
  createAnnotation: (input: CreateAnnotationInput) => Promise<void>;
  loadProjectData: () => Promise<void>;
}

const AnnotationStoreContext = createContext<AnnotationStoreContextValue | undefined>(undefined);

function appendLog(
  setter: React.Dispatch<React.SetStateAction<AnnotationStoreLogEntry[]>>,
  tone: AnnotationStoreLogTone,
  message: string,
  timestamp = new Date().toISOString(),
) {
  setter((current) => {
    const next = [...current, { id: `${Date.now()}-${Math.random()}`, tone, timestamp, message }];
    return next.slice(-200);
  });
}

interface AnnotationStoreProviderProps {
  projectId: string;
  sceneId: string;
  children: React.ReactNode;
}

export function AnnotationStoreProvider({
  projectId,
  sceneId,
  children,
}: AnnotationStoreProviderProps) {
  const storeRef = useRef<AnnotationStore | null>(null);
  const [revision, setRevision] = useState(0);
  const [realtimeState, setRealtimeState] = useState<AnnotationRealtimeState>('idle');
  const [eventLog, setEventLog] = useState<AnnotationStoreLogEntry[]>([]);

  const bump = useCallback(() => setRevision((r) => r + 1), []);
  const clearEventLog = useCallback(() => setEventLog([]), []);

  useEffect(() => {
    if (!projectId || !sceneId) {
      storeRef.current = null;
      setRealtimeState('idle');
      return;
    }

    const store = createAnnotationStore(projectId, sceneId, {
      onUpdate: bump,
      onRealtimeStateChange: (state) => {
        setRealtimeState(state);
        appendLog(setEventLog, 'info', `SSE connection: ${state}`);
      },
      onConflict: (id) => {
        appendLog(setEventLog, 'warning', `Conflict on entity ${id} — local edit was not saved`);
      },
      onError: (err) => {
        const message = err instanceof Error ? err.message : String(err);
        appendLog(setEventLog, 'error', `Store error: ${message}`);
      },
      onEditsCancelled: () => {
        appendLog(setEventLog, 'warning', 'Reconnect cancelled in-flight local edits');
      },
      onConnected: (event: AnnotationConnectedEvent) => {
        appendLog(
          setEventLog,
          'success',
          `SSE connected (stream ${event.streamId}, ${event.activeSocialLocks.length} active lock(s))`,
          event.timestamp,
        );
      },
      onMutation: (event: AnnotationMutationEvent) => {
        appendLog(
          setEventLog,
          'success',
          `Remote ${event.mutation} on ${event.entity.kind} ${event.entity.id} by ${event.username}`,
          event.timestamp,
        );
      },
      onSocialLockStarted: (event: AnnotationSocialLockEvent) => {
        appendLog(
          setEventLog,
          'info',
          `Social lock started (${event.lockKind}) by ${event.username}`,
          event.timestamp,
        );
      },
      onSocialLockStopped: (event: AnnotationSocialLockEvent) => {
        appendLog(
          setEventLog,
          'info',
          `Social lock stopped (${event.lockKind}) by ${event.username}`,
          event.timestamp,
        );
      },
      onReconnect: () => {
        appendLog(setEventLog, 'warning', 'SSE reconnect — store will hard-reset from server');
      },
    });

    storeRef.current = store;
    appendLog(setEventLog, 'info', `Initializing store for scene ${sceneId}`);
    void store.init().catch(() => {
      // onError callback already logs
    });

    return () => {
      storeRef.current = null;
      store.destroy();
      setRealtimeState('idle');
    };
  }, [projectId, sceneId, bump]);

  const store = storeRef.current;

  const geometries = useMemo(
    () => (store ? [...store.geometriesById.values()] : []),
    [store, revision],
  );
  const data = useMemo(
    () => (store ? [...store.dataById.values()] : []),
    [store, revision],
  );
  const links = useMemo(
    () => (store ? [...store.linksById.values()] : []),
    [store, revision],
  );

  const loadScene = useCallback(async (nextSceneId: string) => {
    const current = storeRef.current;
    if (!current) {
      return;
    }
    appendLog(setEventLog, 'info', `Loading scene ${nextSceneId}`);
    await current.loadScene(nextSceneId);
  }, []);

  const updateGeometry = useCallback(async (geometryId: string, shapes: CreateAnnotationInput['shapes']) => {
    await storeRef.current?.updateGeometry(geometryId, shapes);
  }, []);

  const updateData = useCallback(async (dataId: string, input: UpdateDataInput) => {
    await storeRef.current?.updateData(dataId, input);
  }, []);

  const createAnnotation = useCallback(async (input: CreateAnnotationInput) => {
    await storeRef.current?.createAnnotation(input);
  }, []);

  const loadProjectData = useCallback(async () => {
    await storeRef.current?.loadProjectData();
  }, []);

  const value: AnnotationStoreContextValue = {
    store,
    revision,
    geometries,
    data,
    links,
    realtimeState,
    loadingAdditionalData: store?.loadingAdditionalData ?? false,
    creating: store?.creating ?? false,
    eventLog,
    clearEventLog,
    loadScene,
    updateGeometry,
    updateData,
    createAnnotation,
    loadProjectData,
  };

  return (
    <AnnotationStoreContext value={value}>
      {children}
    </AnnotationStoreContext>
  );
}

export function useAnnotationStore(): AnnotationStoreContextValue {
  const context = useContext(AnnotationStoreContext);
  if (!context) {
    throw new Error('useAnnotationStore must be used within an AnnotationStoreProvider');
  }
  return context;
}
