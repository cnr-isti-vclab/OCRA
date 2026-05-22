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
  createEmptyActiveSelection,
  EMPTY_SELECTION_CRITERIA,
  type ActiveAnnotationSelection,
  type SelectionCriteria,
} from '../stores/annotation-selection';
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

export interface AnnotationStoreContextValue {
  store: AnnotationStore | null;
  revision: number;
  /** Full loaded store snapshot (scene + merged project data). */
  allGeometries: AnnotationGeometry[];
  allData: AnnotationData[];
  allLinks: AnnotationLink[];
  /** Query-filtered active sets for viewer (geometries) and panel (data). */
  activeGeometries: AnnotationGeometry[];
  activeData: AnnotationData[];
  activeLinks: AnnotationLink[];
  activeAnnotationSelection: ActiveAnnotationSelection;
  currentSelectionCriteria: Readonly<SelectionCriteria>;
  selectActiveAnnotations: (criteria?: SelectionCriteria) => void;
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
  markGeometryErasable: (geometryId: string) => Promise<void>;
  markGeometryNonErasable: (geometryId: string) => Promise<void>;
  markDataErasable: (dataId: string) => Promise<void>;
  markDataNonErasable: (dataId: string) => Promise<void>;
  markLinkErasable: (linkId: string) => Promise<void>;
  markLinkNonErasable: (linkId: string) => Promise<void>;
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

  const allGeometries = useMemo(
    () => (store ? [...store.geometriesById.values()] : []),
    [store, revision],
  );
  const allData = useMemo(
    () => (store ? [...store.dataById.values()] : []),
    [store, revision],
  );
  const allLinks = useMemo(
    () => (store ? [...store.linksById.values()] : []),
    [store, revision],
  );

  const activeAnnotationSelection = useMemo(
    () => store?.activeAnnotationSelection ?? createEmptyActiveSelection(),
    [store, revision],
  );

  const currentSelectionCriteria = useMemo(
    () => store?.currentSelectionCriteria ?? EMPTY_SELECTION_CRITERIA,
    [store, revision],
  );

  const activeGeometries = useMemo(
    () => [...activeAnnotationSelection.geometriesById.values()],
    [activeAnnotationSelection],
  );
  const activeData = useMemo(
    () => [...activeAnnotationSelection.dataById.values()],
    [activeAnnotationSelection],
  );
  const activeLinks = useMemo(
    () => [...activeAnnotationSelection.linksById.values()],
    [activeAnnotationSelection],
  );

  const selectActiveAnnotations = useCallback((criteria: SelectionCriteria = EMPTY_SELECTION_CRITERIA) => {
    storeRef.current?.selectActiveAnnotations(criteria);
  }, []);

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

  const markGeometryErasable = useCallback(async (geometryId: string) => {
    await storeRef.current?.markGeometryErasable(geometryId);
  }, []);

  const markGeometryNonErasable = useCallback(async (geometryId: string) => {
    await storeRef.current?.markGeometryNonErasable(geometryId);
  }, []);

  const markDataErasable = useCallback(async (dataId: string) => {
    await storeRef.current?.markDataErasable(dataId);
  }, []);

  const markDataNonErasable = useCallback(async (dataId: string) => {
    await storeRef.current?.markDataNonErasable(dataId);
  }, []);

  const markLinkErasable = useCallback(async (linkId: string) => {
    await storeRef.current?.markLinkErasable(linkId);
  }, []);

  const markLinkNonErasable = useCallback(async (linkId: string) => {
    await storeRef.current?.markLinkNonErasable(linkId);
  }, []);

  const value: AnnotationStoreContextValue = {
    store,
    revision,
    allGeometries,
    allData,
    allLinks,
    activeGeometries,
    activeData,
    activeLinks,
    activeAnnotationSelection,
    currentSelectionCriteria,
    selectActiveAnnotations,
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
    markGeometryErasable,
    markGeometryNonErasable,
    markDataErasable,
    markDataNonErasable,
    markLinkErasable,
    markLinkNonErasable,
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
