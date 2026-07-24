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
  AnnotationEventResourceType,
  AnnotationMutationEvent,
  AnnotationSocialLockEvent,
  AnnotationSocialLockState,
} from 'shared/annotation-events';
import type {
  AnnotationData,
  AnnotationGeometry,
  AnnotationLink,
} from 'shared/annotation-types';
import type { AnnotationRealtimeState } from '../services/AnnotationEventsService';
import { fetchVocabularyCatalog } from '../services/VocabularyConceptApi';
import type {
  VocabularyConcept,
  VocabularyProperty,
  VocabularyScheme,
} from '../types/vocabulary';
import {
  createEmptyActiveSelection,
  EMPTY_SELECTION_CRITERIA,
  type ActiveAnnotationSelection,
  type SelectionCriteria,
} from '../stores/annotation-selection';
import { UNCLASSIFIED_ANNOTATION_CLASS } from '../stores/annotation-class-filter';
import type { AnnotationLinkViewMode } from '../features/annotation-link-view/annotationLinkViewMode';
import {
  AnnotationStore,
  type GeometryUpdateOptions,
  type AnnotationUpdateOptions,
  createAnnotationStore,
  type CreateAnnotationInput,
  type UpdateDataInput,
  type AnnotationCreationDraft,
  type AnnotationDeletionDraft,
  type DeletionBasketAddResult,
} from '../stores/AnnotationStore';
import AppMessageModal from '../shared/ui/AppMessageModal';
import { AnnotationMessageModalCatalog } from '../shared/ui/AnnotationMessageModalCatalog';
import { getVocabularyNodeLabel } from '../utils/vocabulary';

export type AnnotationStoreLogTone = 'info' | 'success' | 'warning' | 'error';

export interface AnnotationStoreLogEntry {
  id: string;
  tone: AnnotationStoreLogTone;
  timestamp: string;
  message: string;
}

export interface SceneAnnotationClassOption {
  curie: string;
  label: string;
  color: string;
  dataCount: number;
  geometryCount: number;
}

export type AnnotationClassFilterMode = 'none' | 'custom' | 'all';

export interface AnnotationFocusState {
  focusedGeometryIds: ReadonlySet<string>;
  focusedDataIds: ReadonlySet<string>;
  setFocusedGeometryIds: (geometryIds: Iterable<string>) => void;
  setFocusedDataIds: (dataIds: Iterable<string>) => void;
  focusGeometry: (geometryId: string, multiSelect: boolean) => void;
  focusData: (dataId: string, multiSelect: boolean) => void;
  clearFocus: () => void;
  isDataFocused: (dataId: string) => boolean;
  isGeometryFocused: (geometryId: string) => boolean;
}

export interface AnnotationStoreContextValue extends AnnotationFocusState {
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
  linkViewMode: AnnotationLinkViewMode;
  setLinkViewMode: (mode: AnnotationLinkViewMode) => void;
  vocabularySchemes: VocabularyScheme[];
  vocabularyConcepts: VocabularyConcept[];
  vocabularyProperties: VocabularyProperty[];
  sceneAnnotationClassPool: SceneAnnotationClassOption[];
  annotationClassFilterMode: AnnotationClassFilterMode;
  annotationClassFilterValues: string[];
  setAnnotationClassFilterValues: (values: string[]) => void;
  toggleAnnotationClassFilterValue: (curie: string) => void;
  selectAllAnnotationClassFilters: () => void;
  clearAnnotationClassFilter: () => void;
  realtimeState: AnnotationRealtimeState;
  loadingAdditionalData: boolean;
  creating: boolean;
  creationDraft: Readonly<AnnotationCreationDraft> | null;
  isCreationWizardActive: boolean;
  initCreationDraft: () => void;
  updateCreationDraft: (patch: Partial<AnnotationCreationDraft>) => void;
  discardCreationDraft: () => void;
  beginCreationWizard: () => { ok: true } | { ok: false; message: string };
  advanceCreationStep: () => Promise<{ ok: true } | { ok: false; message: string }>;
  setCreationDraftShapes: (shapes: import('shared/annotation-types').AnnotationShape[]) => void;
  setCreationDraftGeometry: (viewerId: string, shapes: import('shared/annotation-types').AnnotationShape[]) => void;
  setCreationGeometrySelection: (geometryIds: string[]) => void;
  toggleCreationDataSelection: (dataId: string) => void;
  deletionDraft: Readonly<AnnotationDeletionDraft> | null;
  isDeletionWizardActive: boolean;
  initDeletionDraft: () => void;
  updateDeletionDraft: (patch: Partial<AnnotationDeletionDraft>) => void;
  discardDeletionDraft: () => void;
  beginDeletionWizard: (
    intent?: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
  ) => { ok: true } | { ok: false; message: string };
  advanceDeletionStep: () => { ok: true } | { ok: false; message: string };
  addGeometryToDeletionBasket: (geometryId: string) => DeletionBasketAddResult;
  addDataToDeletionBasket: (dataId: string) => DeletionBasketAddResult;
  addLinkOnlyFromEndpoint: (
    endpointKind: 'geometry' | 'data',
    endpointId: string,
  ) => DeletionBasketAddResult;
  removeFromDeletionBasket: (args: {
    linkId?: string;
    geometryId?: string;
    dataId?: string;
  }) => void;
  deselectGeometryFromDeletionBasket: (geometryId: string) => void;
  deselectDataFromDeletionBasket: (dataId: string) => void;
  clearDeletionBasket: () => void;
  confirmDeletionPendingAll: () => void;
  cancelDeletionPendingResolution: () => void;
  beginDeletionCounterpartPick: () => void;
  setDeletionCounterpartSelection: (counterpartIds: string[]) => void;
  toggleDeletionCounterpartSelection: (counterpartId: string) => void;
  confirmDeletionCounterpartPick: () => void;
  reportDeletionSelectionBlocked: (message: string) => void;
  commitDeletionDraft: () => Promise<{ ok: true; message?: string } | { ok: false; message: string }>;
  deleting: boolean;
  eventLog: AnnotationStoreLogEntry[];
  activeSocialLocks: AnnotationSocialLockState[];
  currentStreamId: string | null;
  clearEventLog: () => void;
  getLatestMutationForEntity: (
    kind: AnnotationEventResourceType,
    id: string,
  ) => { mutation: string; username: string; timestamp: string } | null;
  setFocusSelection: (input: FocusSelectionInput, onApplied?: () => void) => void;
  loadScene: (sceneId: string) => Promise<void>;
  updateGeometry: (
    geometryId: string,
    shapes: CreateAnnotationInput['shapes'],
    options?: number | GeometryUpdateOptions,
  ) => Promise<void>;
  updateData: (dataId: string, input: UpdateDataInput, options?: AnnotationUpdateOptions) => Promise<void>;
  createAnnotation: (input: CreateAnnotationInput) => Promise<void>;
  loadProjectData: () => Promise<void>;
  markGeometryErasable: (geometryId: string) => Promise<void>;
  markGeometryNonErasable: (geometryId: string) => Promise<void>;
  markDataErasable: (dataId: string) => Promise<void>;
  markDataNonErasable: (dataId: string) => Promise<void>;
  markAnnotationTripletErasable: (dataId: string) => Promise<void>;
  markLinkErasable: (linkId: string) => Promise<void>;
  markLinkNonErasable: (linkId: string) => Promise<void>;
  startEditorLock: (
    resourceType: AnnotationEventResourceType,
    resourceId: string,
    activity?: string,
  ) => Promise<void>;
  stopEditorLock: (
    resourceType: AnnotationEventResourceType,
    resourceId: string,
    activity?: string,
  ) => Promise<void>;
}

const AnnotationStoreContext = createContext<AnnotationStoreContextValue | undefined>(undefined);

function socialLockKey(lock: {
  streamId: string;
  lockKind: string;
  resourceType: string | null;
  resourceId: string | null;
}): string {
  return `${lock.streamId}:${lock.lockKind}:${lock.resourceType ?? 'none'}:${lock.resourceId ?? 'none'}`;
}

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

interface FocusSelectionInput {
  geometryIds?: Iterable<string>;
  dataIds?: Iterable<string>;
}

interface AnnotationStoreProviderProps {
  projectId: string;
  sceneId: string;
  selectionPolicy?: 'collaborative' | 'readOnly';
  children: React.ReactNode;
}

interface MutationSummary {
  mutation: string;
  username: string;
  timestamp: string;
}

export function AnnotationStoreProvider({
  projectId,
  sceneId,
  selectionPolicy = 'collaborative',
  children,
}: AnnotationStoreProviderProps) {
  const storeRef = useRef<AnnotationStore | null>(null);
  const [revision, setRevision] = useState(0);
  const [realtimeState, setRealtimeState] = useState<AnnotationRealtimeState>('idle');
  const [eventLog, setEventLog] = useState<AnnotationStoreLogEntry[]>([]);
  const [activeSocialLocks, setActiveSocialLocks] = useState<AnnotationSocialLockState[]>([]);
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null);
  const [annotationClassFilterMode, setAnnotationClassFilterMode] = useState<AnnotationClassFilterMode>('all');
  const [customAnnotationClassFilterValues, setCustomAnnotationClassFilterValues] = useState<string[]>([]);
  const [vocabularySchemes, setVocabularySchemes] = useState<VocabularyScheme[]>([]);
  const [vocabularyConcepts, setVocabularyConcepts] = useState<VocabularyConcept[]>([]);
  const [vocabularyProperties, setVocabularyProperties] = useState<VocabularyProperty[]>([]);
  const [selectionConflictLocks, setSelectionConflictLocks] = useState<AnnotationSocialLockState[]>([]);
  const [latestMutationsByEntity, setLatestMutationsByEntity] = useState<Map<string, MutationSummary>>(
    () => new Map(),
  );

  const pendingSelectionRef = useRef<(() => void) | null>(null);

  const bump = useCallback(() => setRevision((r) => r + 1), []);
  const clearEventLog = useCallback(() => setEventLog([]), []);

  const [focusedGeometryIds, setFocusedGeometryIdsState] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [focusedDataIds, setFocusedDataIdsState] = useState<ReadonlySet<string>>(() => new Set());
  const [linkViewMode, setLinkViewMode] = useState<AnnotationLinkViewMode>('showAll');
  const focusedGeometryIdsRef = useRef<ReadonlySet<string>>(new Set());
  const focusedDataIdsRef = useRef<ReadonlySet<string>>(new Set());

  const setFocusedGeometryIds = useCallback((geometryIds: Iterable<string>) => {
    setFocusedGeometryIdsState(new Set(geometryIds));
  }, []);

  const setFocusedDataIds = useCallback((dataIds: Iterable<string>) => {
    setFocusedDataIdsState(new Set(dataIds));
  }, []);

  useEffect(() => {
    focusedGeometryIdsRef.current = focusedGeometryIds;
  }, [focusedGeometryIds]);

  useEffect(() => {
    focusedDataIdsRef.current = focusedDataIds;
  }, [focusedDataIds]);

  const collectSelectionConflicts = useCallback(
    (input: FocusSelectionInput): AnnotationSocialLockState[] => {
      const geometryIds = new Set(input.geometryIds ?? []);
      const dataIds = new Set(input.dataIds ?? []);
      const linkIds = new Set<string>();

      if (geometryIds.size > 0 || dataIds.size > 0) {
        const links = storeRef.current?.linksById;
        if (links) {
          for (const link of links.values()) {
            if (geometryIds.has(link.geometryId) || dataIds.has(link.dataId)) {
              linkIds.add(link.id);
            }
          }
        }
      }

      return activeSocialLocks.filter((lock) => {
        if (!lock.resourceType || !lock.resourceId) {
          return false;
        }
        if (currentStreamId && lock.streamId === currentStreamId) {
          return false;
        }
        if (lock.resourceType === 'geometry') {
          return geometryIds.has(lock.resourceId);
        }
        if (lock.resourceType === 'data') {
          return dataIds.has(lock.resourceId);
        }
        if (lock.resourceType === 'link') {
          return linkIds.has(lock.resourceId);
        }
        return false;
      });
    },
    [activeSocialLocks, currentStreamId],
  );

  const runSelectionWithLockGuard = useCallback(
    (input: FocusSelectionInput, applySelection: () => void) => {
      if (selectionPolicy === 'readOnly') {
        setSelectionConflictLocks([]);
        pendingSelectionRef.current = null;
        applySelection();
        return;
      }

      const conflicts = collectSelectionConflicts(input);
      if (conflicts.length === 0) {
        applySelection();
        return;
      }
      pendingSelectionRef.current = applySelection;
      setSelectionConflictLocks(conflicts);
    },
    [collectSelectionConflicts, selectionPolicy],
  );

  const setFocusSelection = useCallback(
    (input: FocusSelectionInput, onApplied?: () => void) => {
      runSelectionWithLockGuard(input, () => {
        setFocusedGeometryIdsState(new Set(input.geometryIds ?? []));
        setFocusedDataIdsState(new Set(input.dataIds ?? []));
        onApplied?.();
      });
    },
    [runSelectionWithLockGuard],
  );

  const focusGeometry = useCallback((geometryId: string, multiSelect: boolean) => {
    const nextGeometryIds = new Set(focusedGeometryIdsRef.current);
    if (multiSelect) {
      if (nextGeometryIds.has(geometryId)) {
        nextGeometryIds.delete(geometryId);
      } else {
        nextGeometryIds.add(geometryId);
      }
    } else {
      nextGeometryIds.clear();
      nextGeometryIds.add(geometryId);
    }

    runSelectionWithLockGuard({ geometryIds: nextGeometryIds, dataIds: [] }, () => {
      setFocusedGeometryIdsState(nextGeometryIds);
      setFocusedDataIdsState(new Set());
    });
  }, [runSelectionWithLockGuard]);

  const focusData = useCallback((dataId: string, multiSelect: boolean) => {
    const nextDataIds = new Set(focusedDataIdsRef.current);
    if (multiSelect) {
      if (nextDataIds.has(dataId)) {
        nextDataIds.delete(dataId);
      } else {
        nextDataIds.add(dataId);
      }
    } else {
      nextDataIds.clear();
      nextDataIds.add(dataId);
    }

    runSelectionWithLockGuard({ geometryIds: [], dataIds: nextDataIds }, () => {
      setFocusedGeometryIdsState(new Set());
      setFocusedDataIdsState(nextDataIds);
    });
  }, [runSelectionWithLockGuard]);

  const clearFocus = useCallback(() => {
    setFocusedGeometryIdsState(new Set());
    setFocusedDataIdsState(new Set());
  }, []);

  const isDataFocused = useCallback(
    (dataId: string) => focusedDataIds.has(dataId),
    [focusedDataIds],
  );

  const isGeometryFocused = useCallback(
    (geometryId: string) => focusedGeometryIds.has(geometryId),
    [focusedGeometryIds],
  );

  useEffect(() => {
    clearFocus();
    setLinkViewMode('showAll');
  }, [sceneId, clearFocus]);

  useEffect(() => {
    let cancelled = false;

    void fetchVocabularyCatalog()
      .then((catalog) => {
        if (!cancelled) {
          setVocabularySchemes(catalog.schemes);
          setVocabularyConcepts(catalog.concepts);
          setVocabularyProperties(catalog.properties);
        }
      })
      .catch((error) => {
        console.warn('Failed to load vocabulary concepts:', error);
        if (!cancelled) {
          setVocabularySchemes([]);
          setVocabularyConcepts([]);
          setVocabularyProperties([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projectId || !sceneId) {
      storeRef.current = null;
      setRealtimeState('idle');
      setActiveSocialLocks([]);
      setLatestMutationsByEntity(new Map());
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
        setActiveSocialLocks(event.activeSocialLocks);
        setCurrentStreamId(event.streamId);
        appendLog(
          setEventLog,
          'success',
          `SSE connected (stream ${event.streamId}, ${event.activeSocialLocks.length} active lock(s))`,
          event.timestamp,
        );
      },
      onMutation: (event: AnnotationMutationEvent) => {
        const key = `${event.entity.kind}:${event.entity.id}`;
        setLatestMutationsByEntity((prev) => {
          const next = new Map(prev);
          next.set(key, {
            mutation: event.mutation,
            username: event.username,
            timestamp: event.timestamp,
          });
          return next;
        });
        appendLog(
          setEventLog,
          'success',
          `Remote ${event.mutation} on ${event.entity.kind} ${event.entity.id} by ${event.username}`,
          event.timestamp,
        );
      },
      onSocialLockStarted: (event: AnnotationSocialLockEvent) => {
        setActiveSocialLocks((prev) => {
          const key = socialLockKey(event);
          const next = prev.filter((item) => socialLockKey(item) !== key);
          next.push(event);
          return next;
        });
        appendLog(
          setEventLog,
          'info',
          `Social lock started (${event.lockKind}) by ${event.username}`,
          event.timestamp,
        );
      },
      onSocialLockStopped: (event: AnnotationSocialLockEvent) => {
        setActiveSocialLocks((prev) => {
          const key = socialLockKey(event);
          return prev.filter((item) => socialLockKey(item) !== key);
        });
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
      setActiveSocialLocks([]);
      setCurrentStreamId(null);
      setSelectionConflictLocks([]);
      setLatestMutationsByEntity(new Map());
      pendingSelectionRef.current = null;
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

  const sceneAnnotationClassPool = useMemo<SceneAnnotationClassOption[]>(() => {
    const geometryIdsByClass = new Map<string, Set<string>>();
    const dataCountsByClass = new Map<string, number>();
    const conceptByCurie = new Map(vocabularyConcepts.map((concept) => [concept.curie, concept]));
    let unclassifiedDataCount = 0;
    const unclassifiedGeometryIds = new Set<string>();

    for (const datum of activeData) {
      if (!datum.class) {
        unclassifiedDataCount += 1;
        for (const geometryId of activeAnnotationSelection.geometryIdsByDataId.get(datum.id) ?? []) {
          unclassifiedGeometryIds.add(geometryId);
        }
        continue;
      }
      dataCountsByClass.set(datum.class, (dataCountsByClass.get(datum.class) ?? 0) + 1);

      const geometryIds = geometryIdsByClass.get(datum.class) ?? new Set<string>();
      for (const geometryId of activeAnnotationSelection.geometryIdsByDataId.get(datum.id) ?? []) {
        geometryIds.add(geometryId);
      }
      geometryIdsByClass.set(datum.class, geometryIds);
    }

    const options = [...dataCountsByClass.entries()]
      .map(([curie, dataCount]) => {
        const concept = conceptByCurie.get(curie);
        return {
          curie,
          label: concept ? getVocabularyNodeLabel(concept) : curie,
          color: concept?.color || '#808080',
          dataCount,
          geometryCount: geometryIdsByClass.get(curie)?.size ?? 0,
        };
      });

    if (unclassifiedDataCount > 0) {
      options.push({
        curie: UNCLASSIFIED_ANNOTATION_CLASS,
        label: 'Unclassified',
        color: '#808080',
        dataCount: unclassifiedDataCount,
        geometryCount: unclassifiedGeometryIds.size,
      });
    }

    return options.sort((left, right) => {
      if (right.dataCount !== left.dataCount) {
        return right.dataCount - left.dataCount;
      }
      return left.label.localeCompare(right.label);
    });
  }, [activeAnnotationSelection.geometryIdsByDataId, activeData, vocabularyConcepts]);

  const annotationClassFilterValues = useMemo(() => {
    if (annotationClassFilterMode === 'all') {
      return sceneAnnotationClassPool.map((option) => option.curie);
    }
    if (annotationClassFilterMode === 'custom') {
      const validValues = new Set(sceneAnnotationClassPool.map((option) => option.curie));
      return customAnnotationClassFilterValues.filter((curie) => validValues.has(curie));
    }
    return [];
  }, [annotationClassFilterMode, customAnnotationClassFilterValues, sceneAnnotationClassPool]);

  const clearAnnotationClassFilter = useCallback(() => {
    setAnnotationClassFilterMode('none');
    setCustomAnnotationClassFilterValues([]);
  }, []);

  const selectAllAnnotationClassFilters = useCallback(() => {
    if (sceneAnnotationClassPool.length === 0) {
      clearAnnotationClassFilter();
      return;
    }
    if (annotationClassFilterMode === 'all') {
      clearAnnotationClassFilter();
      return;
    }
    setAnnotationClassFilterMode('all');
    setCustomAnnotationClassFilterValues([]);
  }, [annotationClassFilterMode, clearAnnotationClassFilter, sceneAnnotationClassPool.length]);

  const toggleAnnotationClassFilterValue = useCallback((curie: string) => {
    const poolValues = sceneAnnotationClassPool.map((option) => option.curie);
    const next = new Set(annotationClassFilterValues);
    if (next.has(curie)) {
      next.delete(curie);
    } else {
      next.add(curie);
    }

    if (next.size === 0) {
      clearAnnotationClassFilter();
      return;
    }

    if (next.size === poolValues.length) {
      setAnnotationClassFilterMode('all');
      setCustomAnnotationClassFilterValues([]);
      return;
    }

    setAnnotationClassFilterMode('custom');
    setCustomAnnotationClassFilterValues(poolValues.filter((value) => next.has(value)));
  }, [annotationClassFilterValues, clearAnnotationClassFilter, sceneAnnotationClassPool]);

  const setAnnotationClassFilterValues = useCallback((values: string[]) => {
    const poolValues = sceneAnnotationClassPool.map((option) => option.curie);
    const validValues = new Set(poolValues);
    const next = [...new Set(values.map((value) => value.trim()).filter((value) => validValues.has(value)))];

    if (next.length === 0) {
      clearAnnotationClassFilter();
      return;
    }

    if (next.length === poolValues.length) {
      setAnnotationClassFilterMode('all');
      setCustomAnnotationClassFilterValues([]);
      return;
    }

    setAnnotationClassFilterMode('custom');
    setCustomAnnotationClassFilterValues(poolValues.filter((value) => next.includes(value)));
  }, [clearAnnotationClassFilter, sceneAnnotationClassPool]);

  useEffect(() => {
    if (annotationClassFilterMode === 'none') {
      return;
    }

    // Preserve the intended filter mode while the scene class pool is still loading.
    // Otherwise the initial "all" state is downgraded to "none" before vocabulary
    // concepts and active scene classes arrive, so the ALL chip never starts active
    // and semantic viewer colours do not initialize.
    if (sceneAnnotationClassPool.length === 0) {
      return;
    }

    const validValues = new Set(sceneAnnotationClassPool.map((option) => option.curie));
    const filtered = annotationClassFilterValues.filter((curie) => validValues.has(curie));

    if (filtered.length === 0) {
      clearAnnotationClassFilter();
      return;
    }

    if (filtered.length === sceneAnnotationClassPool.length) {
      if (annotationClassFilterMode !== 'all') {
        setAnnotationClassFilterMode('all');
        setCustomAnnotationClassFilterValues([]);
      }
      return;
    }

    if (
      annotationClassFilterMode === 'custom' &&
      filtered.length !== customAnnotationClassFilterValues.length
    ) {
      setCustomAnnotationClassFilterValues(filtered);
    }
  }, [
    annotationClassFilterMode,
    annotationClassFilterValues,
    clearAnnotationClassFilter,
    customAnnotationClassFilterValues.length,
    sceneAnnotationClassPool,
  ]);

  useEffect(() => {
    clearFocus();
  }, [annotationClassFilterMode, annotationClassFilterValues, clearFocus]);

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

  const updateGeometry = useCallback(async (
    geometryId: string,
    shapes: CreateAnnotationInput['shapes'],
    options?: number | GeometryUpdateOptions,
  ) => {
    await storeRef.current?.updateGeometry(geometryId, shapes, options);
  }, []);

  const updateData = useCallback(async (
    dataId: string,
    input: UpdateDataInput,
    options?: AnnotationUpdateOptions,
  ) => {
    await storeRef.current?.updateData(dataId, input, options);
  }, []);

  const createAnnotation = useCallback(async (input: CreateAnnotationInput) => {
    await storeRef.current?.createAnnotation(input);
  }, []);

  const initCreationDraft = useCallback(() => {
    storeRef.current?.initCreationDraft();
  }, []);

  const updateCreationDraft = useCallback((patch: Partial<AnnotationCreationDraft>) => {
    storeRef.current?.updateCreationDraft(patch);
  }, []);

  const discardCreationDraft = useCallback(() => {
    storeRef.current?.discardCreationDraft();
  }, []);

  const beginCreationWizard = useCallback(() => {
    return storeRef.current?.beginCreationWizard() ?? { ok: false as const, message: 'Store not ready.' };
  }, []);

  const advanceCreationStep = useCallback(async () => {
    return storeRef.current?.advanceCreationStep() ?? { ok: false as const, message: 'Store not ready.' };
  }, []);

  const setCreationDraftShapes = useCallback((shapes: import('shared/annotation-types').AnnotationShape[]) => {
    storeRef.current?.setCreationDraftShapes(shapes);
  }, []);

  const setCreationDraftGeometry = useCallback((
    viewerId: string,
    shapes: import('shared/annotation-types').AnnotationShape[],
  ) => {
    storeRef.current?.setCreationDraftGeometry(viewerId, shapes);
  }, []);

  const setCreationGeometrySelection = useCallback((geometryIds: string[]) => {
    storeRef.current?.setCreationGeometrySelection(geometryIds);
  }, []);

  const toggleCreationDataSelection = useCallback((dataId: string) => {
    storeRef.current?.toggleCreationDataSelection(dataId);
  }, []);

  const initDeletionDraft = useCallback(() => {
    storeRef.current?.initDeletionDraft();
  }, []);

  const updateDeletionDraft = useCallback((patch: Partial<AnnotationDeletionDraft>) => {
    storeRef.current?.updateDeletionDraft(patch);
  }, []);

  const discardDeletionDraft = useCallback(() => {
    storeRef.current?.discardDeletionDraft();
  }, []);

  const beginDeletionWizard = useCallback((
    intent?: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
  ) => {
    return storeRef.current?.beginDeletionWizard(intent)
      ?? { ok: false as const, message: 'Store not ready.' };
  }, []);

  const advanceDeletionStep = useCallback(() => {
    return storeRef.current?.advanceDeletionStep() ?? { ok: false as const, message: 'Store not ready.' };
  }, []);

  const addGeometryToDeletionBasket = useCallback((geometryId: string) => {
    return storeRef.current?.addGeometryToDeletionBasket(geometryId)
      ?? { ok: false as const, message: 'Store not ready.' };
  }, []);

  const addDataToDeletionBasket = useCallback((dataId: string) => {
    return storeRef.current?.addDataToDeletionBasket(dataId)
      ?? { ok: false as const, message: 'Store not ready.' };
  }, []);

  const addLinkOnlyFromEndpoint = useCallback((
    endpointKind: 'geometry' | 'data',
    endpointId: string,
  ) => {
    return storeRef.current?.addLinkOnlyFromEndpoint(endpointKind, endpointId)
      ?? { ok: false as const, message: 'Store not ready.' };
  }, []);

  const removeFromDeletionBasket = useCallback((args: {
    linkId?: string;
    geometryId?: string;
    dataId?: string;
  }) => {
    storeRef.current?.removeFromDeletionBasket(args);
  }, []);

  const deselectGeometryFromDeletionBasket = useCallback((geometryId: string) => {
    storeRef.current?.deselectGeometryFromDeletionBasket(geometryId);
  }, []);

  const deselectDataFromDeletionBasket = useCallback((dataId: string) => {
    storeRef.current?.deselectDataFromDeletionBasket(dataId);
  }, []);

  const clearDeletionBasket = useCallback(() => {
    storeRef.current?.clearDeletionBasket();
  }, []);

  const confirmDeletionPendingAll = useCallback(() => {
    storeRef.current?.confirmDeletionPendingAll();
  }, []);

  const cancelDeletionPendingResolution = useCallback(() => {
    storeRef.current?.cancelDeletionPendingResolution();
  }, []);

  const beginDeletionCounterpartPick = useCallback(() => {
    storeRef.current?.beginDeletionCounterpartPick();
  }, []);

  const setDeletionCounterpartSelection = useCallback((counterpartIds: string[]) => {
    storeRef.current?.setDeletionCounterpartSelection(counterpartIds);
  }, []);

  const toggleDeletionCounterpartSelection = useCallback((counterpartId: string) => {
    storeRef.current?.toggleDeletionCounterpartSelection(counterpartId);
  }, []);

  const confirmDeletionCounterpartPick = useCallback(() => {
    storeRef.current?.confirmDeletionCounterpartPick();
  }, []);

  const reportDeletionSelectionBlocked = useCallback((message: string) => {
    storeRef.current?.reportDeletionSelectionBlocked(message);
  }, []);

  const commitDeletionDraft = useCallback(async () => {
    return storeRef.current?.commitDeletionDraft({
      activeSocialLocks,
      currentStreamId,
    }) ?? { ok: false as const, message: 'Store not ready.' };
  }, [activeSocialLocks, currentStreamId]);

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

  const markAnnotationTripletErasable = useCallback(async (dataId: string) => {
    await storeRef.current?.markAnnotationTripletErasable(dataId);
  }, []);

  const markLinkErasable = useCallback(async (linkId: string) => {
    await storeRef.current?.markLinkErasable(linkId);
  }, []);

  const markLinkNonErasable = useCallback(async (linkId: string) => {
    await storeRef.current?.markLinkNonErasable(linkId);
  }, []);

  const startEditorLock = useCallback(
    async (
      resourceType: AnnotationEventResourceType,
      resourceId: string,
      activity?: string,
    ) => {
      await storeRef.current?.notifyEditorLockStart({ resourceType, resourceId, activity });
    },
    [],
  );

  const stopEditorLock = useCallback(
    async (
      resourceType: AnnotationEventResourceType,
      resourceId: string,
      activity?: string,
    ) => {
      await storeRef.current?.notifyEditorLockStop({ resourceType, resourceId, activity });
    },
    [],
  );

  const getLatestMutationForEntity = useCallback((kind: AnnotationEventResourceType, id: string) => {
    return latestMutationsByEntity.get(`${kind}:${id}`) ?? null;
  }, [latestMutationsByEntity]);

  const value: AnnotationStoreContextValue = {
    focusedGeometryIds,
    focusedDataIds,
    setFocusedGeometryIds,
    setFocusedDataIds,
    focusGeometry,
    focusData,
    clearFocus,
    isDataFocused,
    isGeometryFocused,
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
    linkViewMode,
    setLinkViewMode,
    vocabularySchemes,
    vocabularyConcepts,
    vocabularyProperties,
    sceneAnnotationClassPool,
    annotationClassFilterMode,
    annotationClassFilterValues,
    setAnnotationClassFilterValues,
    toggleAnnotationClassFilterValue,
    selectAllAnnotationClassFilters,
    clearAnnotationClassFilter,
    realtimeState,
    loadingAdditionalData: store?.loadingAdditionalData ?? false,
    creating: store?.creating ?? false,
    deleting: store?.deleting ?? false,
    creationDraft: store?.creationDraftState ?? null,
    isCreationWizardActive: store?.isCreationWizardActive ?? false,
    initCreationDraft,
    updateCreationDraft,
    discardCreationDraft,
    beginCreationWizard,
    advanceCreationStep,
    setCreationDraftShapes,
    setCreationDraftGeometry,
    setCreationGeometrySelection,
    toggleCreationDataSelection,
    deletionDraft: store?.deletionDraftState ?? null,
    isDeletionWizardActive: store?.isDeletionWizardActive ?? false,
    initDeletionDraft,
    updateDeletionDraft,
    discardDeletionDraft,
    beginDeletionWizard,
    advanceDeletionStep,
    addGeometryToDeletionBasket,
    addDataToDeletionBasket,
    addLinkOnlyFromEndpoint,
    removeFromDeletionBasket,
    deselectGeometryFromDeletionBasket,
    deselectDataFromDeletionBasket,
    clearDeletionBasket,
    confirmDeletionPendingAll,
    cancelDeletionPendingResolution,
    beginDeletionCounterpartPick,
    setDeletionCounterpartSelection,
    toggleDeletionCounterpartSelection,
    confirmDeletionCounterpartPick,
    reportDeletionSelectionBlocked,
    commitDeletionDraft,
    eventLog,
    activeSocialLocks,
    currentStreamId,
    clearEventLog,
    getLatestMutationForEntity,
    loadScene,
    updateGeometry,
    updateData,
    createAnnotation,
    loadProjectData,
    markGeometryErasable,
    markGeometryNonErasable,
    markDataErasable,
    markDataNonErasable,
    markAnnotationTripletErasable,
    markLinkErasable,
    markLinkNonErasable,
    startEditorLock,
    stopEditorLock,
    setFocusSelection,
  };

  const selectionConflictModalDescriptor = useMemo(
    () => (selectionConflictLocks.length > 0
      ? AnnotationMessageModalCatalog.lockConflict(selectionConflictLocks)
      : null),
    [selectionConflictLocks],
  );

  const clearSelectionConflict = useCallback(() => {
    pendingSelectionRef.current = null;
    setSelectionConflictLocks([]);
  }, []);

  return (
    <>
      <AnnotationStoreContext value={value}>
        {children}
      </AnnotationStoreContext>
      <AppMessageModal
        descriptor={selectionConflictModalDescriptor}
        onClose={() => {
          clearFocus();
          clearSelectionConflict();
        }}
        onAction={(actionKey) => {
          if (actionKey === 'continue') {
            const pending = pendingSelectionRef.current;
            pendingSelectionRef.current = null;
            setSelectionConflictLocks([]);
            pending?.();
            return;
          }

          clearFocus();
          clearSelectionConflict();
        }}
      />
    </>
  );
}

export function useAnnotationStore(): AnnotationStoreContextValue {
  const context = useContext(AnnotationStoreContext);
  if (!context) {
    throw new Error('useAnnotationStore must be used within an AnnotationStoreProvider');
  }
  return context;
}
