import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OpenLIMEViewer, {
  type OpenLIMEViewerRef,
  simplifiedAnnotationToViewerAnnotation,
} from '../../adapters/openlime-viewer/OpenLIMEViewer';
import { applyOpenLimeToolbarMode } from '../../adapters/openlime-viewer/openlimeToolbarMode';
import AnnotationToolbar, {
  type AnnotationToolbarMode,
} from '../../components/AnnotationToolbar';
import type { SceneDescription, ViewerAnnotation } from '../../../../shared/scene-types';
import type { AnnotationShape } from '../../../../shared/annotation-types';
import { DigitalAsset } from '../HDTPage';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { useAnnotationLinkView } from '../../features/annotation-link-view/useAnnotationLinkView';
import { CREATION_DRAFT_GEOMETRY_ID } from '../../features/annotation-creation/constants';
import { registerCreationDraftGeometryFlush } from '../../features/annotation-creation/creationDraftGeometryFlush';
import { purgeCreationGeometryDrafts } from '../../features/annotation-creation/purgeCreationGeometryDrafts';
import { useAnnotationCreationWizard } from '../../features/annotation-creation/useAnnotationCreationWizard';
import { useAnnotationDeletionWizard } from '../../features/annotation-deletion/useAnnotationDeletionWizard';
import { applyDeletionCounterpartGeometryPicks } from '../../features/annotation-deletion/applyDeletionCounterpartGeometryPicks';
import { applyDeletionGeometryPicks } from '../../features/annotation-deletion/applyDeletionGeometryPicks';
import DeletionGeometryPickBar from '../../features/annotation-deletion/DeletionGeometryPickBar';
import {
  creationToolbarDisabledModes,
  resolveCreationToolbarMode,
} from '../../features/annotation-creation/resolveCreationToolbarMode';
import { AnnotationApiError } from '../../services/AnnotationApiClient';
import {
  activeGeometriesToViewerAnnotations,
  dataIdsForFocusedGeometries,
  getViewerHighlightGeometryIds,
} from '../../adapters/annotation-store/geometryToViewerAnnotation';
import { viewerGeometryToShapes } from '../../adapters/annotation-store/viewerAnnotationToShapes';
import {
  applyOpenLimeUnderEditing,
  applyOpenLimeSelection,
  syncOpenLimeAnnotations,
  type OpenLimeLabelVisibility,
  type OpenLimeAnnotationManager,
  type OpenLimeSelectionInteractionMode,
} from '../../adapters/annotation-store/openlimeAnnotationAdapter';
import { shapesEqual } from '../../adapters/annotation-store/shapesEqual';
import { isUnclassifiedClassFilter } from '../../stores/annotation-class-filter';
import AppMessageModal from '../../shared/ui/AppMessageModal';
import {
  AnnotationMessageModalCatalog,
} from '../../shared/ui/AnnotationMessageModalCatalog';
import type { MessageModalDescriptor } from '../../shared/ui/AppMessageModalModel';
import ViewerSettingsModal from '../../shared/ui/ViewerSettingsModal';
import type { AnnotationMode } from '../../features/annotation-modes/resolveAnnotationMode';

interface Viewer2DPanelProps {
  sceneDesc: SceneDescription | null;
  digitalAssets: DigitalAsset[];
  twoDimensionalAssetAvailable: boolean;
  annotationMode: AnnotationMode;
  onReady: () => void;
  onError: (error: Error) => void;
}

interface GeometryEditSnapshot {
  version: number;
  shapes: AnnotationShape[];
}

function cloneShapes(shapes: AnnotationShape[]): AnnotationShape[] {
  return shapes.map((shape) => ({
    ...shape,
    vertices: shape.vertices.map((vertex) => [vertex[0], vertex[1], vertex[2]]),
  }));
}

function hexToRgba(color: string, alpha: number): string {
  const normalized = color.trim();
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (!(hex.length === 3 || hex.length === 6) || !/^[0-9a-fA-F]+$/.test(hex)) {
    return color;
  }

  const expanded = hex.length === 3
    ? hex.split('').map((char) => `${char}${char}`).join('')
    : hex;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * OpenLIME 2D viewer wired to {@link AnnotationStore} active geometries and UI focus state.
 */
const Viewer2DPanel = forwardRef<OpenLIMEViewerRef, Viewer2DPanelProps>(
  ({ sceneDesc, digitalAssets, twoDimensionalAssetAvailable, annotationMode, onReady, onError }, ref) => {
    const {
      activeAnnotationSelection,
      activeSocialLocks,
      activeData,
      currentStreamId,
      allLinks,
      revision,
      sceneAnnotationClassPool,
      annotationClassFilterValues,
      focusedDataIds,
      focusedGeometryIds,
      setFocusedGeometryIds,
      setFocusedDataIds,
      setFocusSelection,
      clearFocus,
      updateGeometry,
      startEditorLock,
      stopEditorLock,
    } = useAnnotationStore();
    const { visibleGeometries } = useAnnotationLinkView();
    const {
      creationDraft,
      isCreationGeometryStep,
      isCreationGeometryNew,
      isCreationGeometrySearch,
      isCreationPendingNewGeometry,
      creationHighlightGeometryIds,
      searchableGeometries,
      setCreationDraftShapes,
      setCreationDraftGeometry,
      setCreationGeometrySelection,
    } = useAnnotationCreationWizard();
    const {
      deletionDraft,
      isDeletionSelectingStep,
      isDeletionDataLed,
      isDeletionGeometryPickActive,
      deletionHighlightGeometryIds,
      addGeometryToDeletionBasket,
      addLinkOnlyFromEndpoint,
      deselectGeometryFromDeletionBasket,
      clearDeletionBasket,
      setDeletionCounterpartSelection,
      confirmDeletionCounterpartPick,
      cancelDeletionPendingResolution,
      reportDeletionSelectionBlocked,
    } = useAnnotationDeletionWizard();

    const isStoreSyncRef = useRef(false);
    const expectedProgrammaticSelectionRef = useRef<string[] | null>(null);
    const applyingProgrammaticSelectionRef = useRef(false);
    const editSnapshotsRef = useRef<Map<string, GeometryEditSnapshot>>(new Map());
    const isPointerDownRef = useRef(false);
    const deletionPointerToggleRef = useRef(false);
    const deletionPreviousSelectionRef = useRef<string[]>([]);
    // Always-current refs for use inside pointer event handlers (avoids stale closures).
    const focusedGeometryIdsRef = useRef(focusedGeometryIds);
    focusedGeometryIdsRef.current = focusedGeometryIds;
    const activeGeometriesRef = useRef(visibleGeometries);
    activeGeometriesRef.current = visibleGeometries;
    const [toolbarMode, setToolbarMode] = useState<AnnotationToolbarMode>('edit');
    const [viewerReady, setViewerReady] = useState(false);
    const [annotationManagerRevision, setAnnotationManagerRevision] = useState(0);
    const [pencilActive, setPencilActive] = useState(false);
    const [messageModal, setMessageModal] = useState<MessageModalDescriptor | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [labelVisibility, setLabelVisibility] = useState<OpenLimeLabelVisibility>('selected');
    const geometryEditorLockIdsRef = useRef<Set<string>>(new Set());
    const pendingConflictGeometryIdsRef = useRef<Set<string>>(new Set());
    const lastDraftGeometryViewerIdRef = useRef<string | null>(null);
    const selectionInteractionMode: OpenLimeSelectionInteractionMode =
      annotationMode === 'viewer'
        ? 'preserve'
        : isCreationGeometryStep
          ? isCreationGeometryNew && !isCreationPendingNewGeometry
            ? 'preserve'
            : 'edit'
          : !pencilActive
            ? 'preserve'
            : 'edit';

    useEffect(() => {
      if (!isDeletionSelectingStep) {
        deletionPointerToggleRef.current = false;
        deletionPreviousSelectionRef.current = [];
        return;
      }
      const onPointerDown = (event: PointerEvent) => {
        deletionPointerToggleRef.current = event.ctrlKey || event.metaKey;
      };
      window.addEventListener('pointerdown', onPointerDown, true);
      return () => window.removeEventListener('pointerdown', onPointerDown, true);
    }, [isDeletionSelectingStep]);

    // Entering data-led pick mode: drop basket selection from the viewer baseline.
    useEffect(() => {
      if (!isDeletionGeometryPickActive) {
        return;
      }
      deletionPreviousSelectionRef.current = [
        ...(deletionDraft?.pendingResolution?.selectedCounterpartIds ?? []),
      ];
    }, [isDeletionGeometryPickActive, deletionDraft?.pendingResolution?.endpointId]);

    const resolveToolbarMode = useCallback(
      (currentMode: AnnotationToolbarMode = toolbarMode): AnnotationToolbarMode =>
        resolveCreationToolbarMode(currentMode, {
          isCreationGeometryNew,
          isCreationGeometrySearch,
          hasDraftGeometry: isCreationPendingNewGeometry,
          defaultCreateMode: 'area',
        }),
      [isCreationGeometryNew, isCreationGeometrySearch, isCreationPendingNewGeometry, toolbarMode],
    );

    const applyToolbarMode = useCallback(
      (mode: AnnotationToolbarMode) => {
        setToolbarMode(mode);
        const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
        const manager = viewer?.getAnnotationManager() as OpenLimeAnnotationManager | null;
        if (!viewer || !manager) {
          return;
        }
        applyOpenLimeToolbarMode(manager, viewer, mode);
      },
      [ref],
    );

    const handlePencilActiveChange = useCallback((active: boolean) => {
      setPencilActive(active);
    }, []);

    /** Full pencil + interaction mode for panel-driven focus and creation wizard. */
    const enableAnnotationEditInteraction = useCallback(() => {
      if (annotationMode !== 'edit' || (!pencilActive && !isCreationGeometryStep)) {
        return null;
      }
      const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
      const manager = viewer?.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!viewer || !manager) {
        return null;
      }
      const mode = resolveToolbarMode();
      setToolbarMode(mode);
      applyOpenLimeToolbarMode(manager, viewer, mode);
      return manager;
    }, [annotationMode, pencilActive, isCreationGeometryStep, ref, resolveToolbarMode]);

    const handleViewerReady = useCallback(() => {
      setViewerReady(true);
      setAnnotationManagerRevision((revision) => revision + 1);
      onReady();
    }, [onReady]);

    useEffect(() => {
      return registerCreationDraftGeometryFlush(() => {
        if (!isCreationGeometryNew || !creationDraft?.draftGeometryViewerId) {
          return;
        }
        const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
        const simplified = viewer?.getAnnotationById(creationDraft.draftGeometryViewerId);
        if (!simplified) {
          return;
        }
        const viewerAnno = simplifiedAnnotationToViewerAnnotation(simplified);
        setCreationDraftShapes(viewerGeometryToShapes(viewerAnno.type, viewerAnno.geometry));
      });
    }, [
      creationDraft?.draftGeometryViewerId,
      isCreationGeometryNew,
      ref,
      setCreationDraftShapes,
    ]);

    function normalizeIds(ids: string[]): string[] {
      return [...ids].sort();
    }

    /** Stable labels for OpenLIME sync — exclude focus-driven label text to avoid resync storms. */
    /** Stable labels for OpenLIME sync — exclude focus-driven label text to avoid resync storms. */
    const viewerAnnotationsForSync = useMemo(
      () =>
        activeGeometriesToViewerAnnotations(
          visibleGeometries,
          activeAnnotationSelection,
          new Set(),
          annotationClassFilterValues,
        ),
      [visibleGeometries, activeAnnotationSelection, annotationClassFilterValues, revision],
    );

    const semanticClassesForFilter = useMemo(() => {
      if (annotationClassFilterValues.length === 0) {
        return {};
      }

      const classOptionsByCurie = new Map(
        sceneAnnotationClassPool.map((option) => [option.curie, option]),
      );
      type SemanticClassEntry = [string, Record<string, string>];
      const semanticClassEntries: SemanticClassEntry[] = [];

      for (const classId of annotationClassFilterValues) {
        if (isUnclassifiedClassFilter(classId)) {
          continue;
        }
        const option = classOptionsByCurie.get(classId);
        if (!option) {
          continue;
        }
        semanticClassEntries.push([
          classId,
          {
            label: option.label,
            stroke: option.color,
            fill: hexToRgba(option.color, 0.3),
            fillSelected: hexToRgba(option.color, 0.4),
            strokeSelected: option.color,
          },
        ]);
      }

      return Object.fromEntries(semanticClassEntries);
    }, [annotationClassFilterValues, sceneAnnotationClassPool]);

    const highlightGeometryIds = useMemo(
      () => {
        if (creationHighlightGeometryIds !== null) {
          return creationHighlightGeometryIds;
        }
        if (deletionHighlightGeometryIds !== null) {
          return deletionHighlightGeometryIds;
        }
        return getViewerHighlightGeometryIds(
          focusedGeometryIds,
          focusedDataIds,
          activeAnnotationSelection,
        );
      },
      [
        creationHighlightGeometryIds,
        deletionHighlightGeometryIds,
        focusedGeometryIds,
        focusedDataIds,
        activeAnnotationSelection,
      ],
    );

    const lockedGeometryIds = useMemo(
      () =>
        activeSocialLocks
          .filter(
            (lock) =>
              lock.lockKind === 'editor' &&
              lock.resourceType === 'geometry' &&
              typeof lock.resourceId === 'string' &&
              lock.resourceId.length > 0 &&
              (!currentStreamId || lock.streamId !== currentStreamId),
          )
          .map((lock) => lock.resourceId as string),
      [activeSocialLocks, currentStreamId],
    );

    const highlightGeometryIdsRef = useRef(highlightGeometryIds);
    highlightGeometryIdsRef.current = highlightGeometryIds;

    const handleAnnotationCreated = (anno: ViewerAnnotation) => {
      if (isStoreSyncRef.current || annotationMode !== 'edit') {
        return;
      }

      if (!isCreationGeometryNew) {
        const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
        const manager = viewer?.getAnnotationManager() as OpenLimeAnnotationManager | null;
        if (manager?.getAnnotationById(anno.id)) {
          manager.deleteAnnotation(anno.id);
          manager.viewer?.redraw?.();
        }
        return;
      }

      const shapes = viewerGeometryToShapes(anno.type, anno.geometry);
      const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
      const manager = viewer?.getAnnotationManager() as OpenLimeAnnotationManager | null;
      const previousViewerId = creationDraft?.draftGeometryViewerId ?? null;
      if (previousViewerId && previousViewerId !== anno.id) {
        purgeCreationGeometryDrafts(manager, {
          removeViewerIds: [previousViewerId],
          keepViewerId: anno.id,
        });
      } else {
        purgeCreationGeometryDrafts(manager, { keepViewerId: anno.id });
      }
      setCreationDraftGeometry(anno.id, shapes);
      requestAnimationFrame(() => {
        applyToolbarMode('edit');
      });
    };

    const captureGeometryEditSnapshot = (geometryId: string) => {
      if (editSnapshotsRef.current.has(geometryId)) {
        return;
      }
      if (
        creationDraft?.draftGeometryViewerId
        && geometryId === creationDraft.draftGeometryViewerId
      ) {
        editSnapshotsRef.current.set(geometryId, {
          version: 0,
          shapes: cloneShapes(creationDraft.draftShapes),
        });
        return;
      }
      if (geometryId === CREATION_DRAFT_GEOMETRY_ID && creationDraft) {
        editSnapshotsRef.current.set(geometryId, {
          version: 0,
          shapes: cloneShapes(creationDraft.draftShapes),
        });
        return;
      }
      const geo = activeGeometriesRef.current.find((g) => g.id === geometryId);
      if (!geo) {
        return;
      }
      editSnapshotsRef.current.set(geometryId, {
        version: geo.version,
        shapes: cloneShapes(geo.shapes),
      });
    };

    const handleAnnotationEditStart = (anno: ViewerAnnotation) => {
      if (annotationMode !== 'edit') {
        return;
      }
      // Capture the local editing copy at the exact OpenLIME edit start.
      captureGeometryEditSnapshot(anno.id);
    };

    const handleViewerPointerDown = (e: React.PointerEvent) => {
      isPointerDownRef.current = true;

      // In viewer mode, OpenLIME selection may not clear when clicking on empty space.
      // Mirror editor behaviour by clearing focus on background clicks.
      if (annotationMode === 'viewer' && e.button === 0) {
        const target = e.target as HTMLElement | null;
        const isUiClick =
          Boolean(target?.closest?.('.openlime-button')) ||
          Boolean(target?.closest?.('.openlime-dialog')) ||
          Boolean(target?.closest?.('.annotation-toolbar'));
        const isAnnotationClick = Boolean(target?.closest?.('.openlime-annotation'));
        if (!isUiClick && !isAnnotationClick) {
          const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
          const manager = viewer?.getAnnotationManager();
          manager?.deselectAll?.();
          clearFocus();
        }
      }

      // Snapshot focused geometries so any concurrent SSE update cannot replace the
      // OpenLIME object being dragged, and OCC still uses the edit-start version.
      for (const id of focusedGeometryIdsRef.current) {
        captureGeometryEditSnapshot(id);
      }
    };

    const handleViewerPointerUpOrCancel = useCallback(() => {
      isPointerDownRef.current = false;
      // RAF fires after OpenLIME's document-level pointerup handler (and thus after
      // handleAnnotationUpdated). Any snapshot still present was captured at pointer-down
      // but not consumed by a vertex drag — safe to drop unless it's a pending conflict.
      requestAnimationFrame(() => {
        for (const id of [...editSnapshotsRef.current.keys()]) {
          if (!pendingConflictGeometryIdsRef.current.has(id)) {
            editSnapshotsRef.current.delete(id);
          }
        }
      });
    }, []);

    useEffect(() => {
      const handleGlobalPointerEnd = () => {
        if (isPointerDownRef.current) {
          handleViewerPointerUpOrCancel();
        }
      };

      window.addEventListener('pointerup', handleGlobalPointerEnd);
      window.addEventListener('pointercancel', handleGlobalPointerEnd);

      return () => {
        window.removeEventListener('pointerup', handleGlobalPointerEnd);
        window.removeEventListener('pointercancel', handleGlobalPointerEnd);
      };
    }, [handleViewerPointerUpOrCancel]);

    const handleAnnotationUpdated = (anno: ViewerAnnotation) => {
      if (isStoreSyncRef.current || annotationMode !== 'edit') {
        return;
      }

      const draftViewerId = creationDraft?.draftGeometryViewerId;
      if (draftViewerId && anno.id === draftViewerId) {
        if (isCreationPendingNewGeometry) {
          setCreationDraftShapes(viewerGeometryToShapes(anno.type, anno.geometry));
        }
        editSnapshotsRef.current.delete(anno.id);
        return;
      }

      if (anno.id === CREATION_DRAFT_GEOMETRY_ID) {
        if (isCreationPendingNewGeometry) {
          setCreationDraftShapes(viewerGeometryToShapes(anno.type, anno.geometry));
        }
        return;
      }

      const nextShapes = viewerGeometryToShapes(anno.type, anno.geometry);
      const editSnapshot = editSnapshotsRef.current.get(anno.id);
      const baselineShapes =
        editSnapshot?.shapes ?? activeGeometriesRef.current.find((g) => g.id === anno.id)?.shapes;
      if (baselineShapes && shapesEqual(baselineShapes, nextShapes)) {
        editSnapshotsRef.current.delete(anno.id);
        return;
      }
      const expectedVersion = editSnapshot?.version;
      void updateGeometry(anno.id, nextShapes, {
        expectedVersion,
        optimistic: false,
      })
        .then(() => {
          editSnapshotsRef.current.delete(anno.id);
        })
        .catch((err) => {
          if (err instanceof AnnotationApiError && err.status === 409) {
            pendingConflictGeometryIdsRef.current.add(anno.id);
            setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'update_geometry'));
            return;
          }

          editSnapshotsRef.current.delete(anno.id);
          console.error('Failed to update 2D annotation geometry:', err);
        });
    };

    const handleAnnotationSelectionChange = (ids: string[]) => {
      // Ignore selectionChange events caused by store-driven sync/selection.
      // (OpenLIME may emit transient empty selections during a sync pass.)
      if (isStoreSyncRef.current) {
        return;
      }

      const expected = expectedProgrammaticSelectionRef.current;
      if (expected) {
        const normalized = normalizeIds(ids);
        if (
          normalized.length === expected.length &&
          normalized.every((id, idx) => id === expected[idx])
        ) {
          expectedProgrammaticSelectionRef.current = null;
          return;
        }
        // OpenLIME may emit a transient empty selection during programmatic highlight sync.
        // Otherwise, during deletion, fall through so Link+Geo can clear the basket and
        // Link+Data can restore highlight-only selection.
        // During geometry pick mode always ignore transient empties — clearing expected
        // here would drop in-progress counterpart picks after every sync.
        if (expected.length > 0 && ids.length === 0) {
          if (
            applyingProgrammaticSelectionRef.current
            || !isDeletionSelectingStep
            || isDeletionGeometryPickActive
          ) {
            return;
          }
        }
        // If it doesn't match, it is a real user selection; clear the expectation.
        expectedProgrammaticSelectionRef.current = null;
      }
      if (ids.length === 0) {
        if (isCreationGeometrySearch) {
          setCreationGeometrySelection([]);
          return;
        }
        if (isDeletionSelectingStep && deletionDraft) {
          // Data-led Let-me-select: clear counterpart picks only (basket stays intact).
          if (isDeletionGeometryPickActive) {
            setDeletionCounterpartSelection([]);
            deletionPreviousSelectionRef.current = [];
            return;
          }
          // Other pending 1:N modals: ignore background clicks.
          if (deletionDraft.pendingResolution) {
            return;
          }
          // Link+Data: viewer is highlight-only — ignore background clear, snap highlights back.
          if (isDeletionDataLed) {
            const restoreIds = (deletionHighlightGeometryIds ?? highlightGeometryIds)
              .filter((id) => id !== CREATION_DRAFT_GEOMETRY_ID);
            const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
            const manager = viewer?.getAnnotationManager() as OpenLimeAnnotationManager | null;
            applyingProgrammaticSelectionRef.current = true;
            expectedProgrammaticSelectionRef.current = normalizeIds(restoreIds);
            applyOpenLimeSelection(manager, restoreIds, selectionInteractionMode);
            deletionPreviousSelectionRef.current = restoreIds;
            requestAnimationFrame(() => {
              applyingProgrammaticSelectionRef.current = false;
            });
            return;
          }
          clearDeletionBasket();
          deletionPreviousSelectionRef.current = [];
          return;
        }
        clearFocus();
        return;
      }

      if (isCreationGeometrySearch) {
        const searchableIds = new Set(searchableGeometries.map((geometry) => geometry.id));
        const filtered = ids.filter(
          (id) => id !== CREATION_DRAFT_GEOMETRY_ID && searchableIds.has(id),
        );
        setCreationGeometrySelection(filtered);
        return;
      }

      if (isDeletionSelectingStep && deletionDraft) {
        const filteredIds = ids.filter((id) => id !== CREATION_DRAFT_GEOMETRY_ID);

        if (isDeletionGeometryPickActive) {
          const pending = deletionDraft.pendingResolution;
          const allowed = new Set(
            pending?.endpointKind === 'data'
              ? (activeAnnotationSelection.geometryIdsByDataId.get(pending.endpointId) ?? [])
              : [],
          );
          const nextIds = applyDeletionCounterpartGeometryPicks(
            filteredIds,
            deletionDraft,
            {
              setDeletionCounterpartSelection,
              reportDeletionSelectionBlocked,
            },
            {
              activeSocialLocks,
              currentStreamId,
              links: allLinks,
              geometryIdsByDataId: activeAnnotationSelection.geometryIdsByDataId,
            },
            {
              toggle: deletionPointerToggleRef.current,
              previousSelectedIds: deletionPreviousSelectionRef.current,
              allowedGeometryIds: allowed,
            },
          );
          deletionPreviousSelectionRef.current = nextIds;
          return;
        }

        if (deletionDraft.pendingResolution) {
          return;
        }

        // Link+Data: geometries are highlight-only — ignore user picks and restore basket highlights.
        if (isDeletionDataLed) {
          const restoreIds = (deletionHighlightGeometryIds ?? highlightGeometryIds)
            .filter((id) => id !== CREATION_DRAFT_GEOMETRY_ID);
          const normalizedRestore = normalizeIds(restoreIds);
          const normalizedIncoming = normalizeIds(filteredIds);
          if (
            normalizedIncoming.length === normalizedRestore.length
            && normalizedIncoming.every((id, index) => id === normalizedRestore[index])
          ) {
            deletionPreviousSelectionRef.current = filteredIds;
            return;
          }
          const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
          const manager = viewer?.getAnnotationManager() as OpenLimeAnnotationManager | null;
          applyingProgrammaticSelectionRef.current = true;
          expectedProgrammaticSelectionRef.current = normalizedRestore;
          applyOpenLimeSelection(manager, restoreIds, selectionInteractionMode);
          deletionPreviousSelectionRef.current = restoreIds;
          requestAnimationFrame(() => {
            applyingProgrammaticSelectionRef.current = false;
          });
          return;
        }

        applyDeletionGeometryPicks(
          filteredIds,
          deletionDraft,
          {
            addGeometryToDeletionBasket,
            addLinkOnlyFromEndpoint,
            deselectGeometryFromDeletionBasket,
            reportDeletionSelectionBlocked,
          },
          {
            activeSocialLocks,
            currentStreamId,
            links: allLinks,
            geometryIdsByDataId: activeAnnotationSelection.geometryIdsByDataId,
          },
          {
            toggle: deletionPointerToggleRef.current,
            previousSelectedIds: deletionPreviousSelectionRef.current,
            links: allLinks,
          },
        );
        deletionPreviousSelectionRef.current = filteredIds;
        return;
      }

      setFocusSelection({
        geometryIds: ids,
        dataIds: dataIdsForFocusedGeometries(ids, activeAnnotationSelection),
      });
    };

    const runStoreOpenLimeSync = (annotationManager: OpenLimeAnnotationManager) => {
      isStoreSyncRef.current = true;
      try {
        // While a geometry has a local edit snapshot, block store-driven shape sync
        // for that id. The user edits the OpenLIME copy captured at pointer/edit start;
        // remote store changes remain in the store and will surface after the edit ends.
        const excludeIds = new Set(editSnapshotsRef.current.keys());
        if (excludeIds.size === 0 && isPointerDownRef.current) {
          for (const id of focusedGeometryIdsRef.current) {
            excludeIds.add(id);
          }
        }
        const preserveIds = new Set<string>();
        const draftViewerId = creationDraft?.draftGeometryViewerId;
        if (isCreationPendingNewGeometry && draftViewerId) {
          preserveIds.add(draftViewerId);
          excludeIds.add(draftViewerId);
        }
        syncOpenLimeAnnotations(
          annotationManager,
          viewerAnnotationsForSync,
          excludeIds,
          preserveIds,
        );
      } finally {
        isStoreSyncRef.current = false;
      }
    };

    const releaseConflictSnapshotsAndSync = useCallback(() => {
      for (const id of pendingConflictGeometryIdsRef.current) {
        editSnapshotsRef.current.delete(id);
      }
      pendingConflictGeometryIdsRef.current.clear();
      setMessageModal(null);

      const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
      const annotationManager = viewer?.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!annotationManager) {
        return;
      }

      runStoreOpenLimeSync(annotationManager);
      const idsToSelect = highlightGeometryIdsRef.current;
      if (idsToSelect.length > 0 && !isPointerDownRef.current) {
        const managerForSelect =
          enableAnnotationEditInteraction() ?? annotationManager;
        applyingProgrammaticSelectionRef.current = true;
        expectedProgrammaticSelectionRef.current = normalizeIds(idsToSelect);
        applyOpenLimeSelection(managerForSelect, idsToSelect, selectionInteractionMode);
        requestAnimationFrame(() => {
          applyingProgrammaticSelectionRef.current = false;
        });
      }
      applyOpenLimeUnderEditing(annotationManager, lockedGeometryIds);
    }, [lockedGeometryIds, ref, viewerAnnotationsForSync, enableAnnotationEditInteraction]);

    const syncGeometryEditorLocks = useCallback(
      async (geometryIds: string[]) => {
        const prev = geometryEditorLockIdsRef.current;
        const next = new Set(geometryIds);

        const toStart = [...next].filter((id) => !prev.has(id));
        const toStop = [...prev].filter((id) => !next.has(id));

        for (const id of toStop) {
          editSnapshotsRef.current.delete(id);
        }

        await Promise.all([
          ...toStart.map((id) =>
            startEditorLock('geometry', id, 'editing annotation geometry').catch((err) => {
              console.warn('Failed to publish geometry editor lock:', err);
            }),
          ),
          ...toStop.map((id) =>
            stopEditorLock('geometry', id, 'editing annotation geometry').catch((err) => {
              console.warn('Failed to release geometry editor lock:', err);
            }),
          ),
        ]);

        geometryEditorLockIdsRef.current = next;
      },
      [startEditorLock, stopEditorLock],
    );

    useEffect(() => {
      if (creationDraft?.draftGeometryViewerId) {
        lastDraftGeometryViewerIdRef.current = creationDraft.draftGeometryViewerId;
      }
    }, [creationDraft?.draftGeometryViewerId]);

    useEffect(() => {
      const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
      const manager = viewer?.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!manager) {
        return;
      }

      if (isCreationPendingNewGeometry) {
        purgeCreationGeometryDrafts(manager, {
          keepViewerId: creationDraft?.draftGeometryViewerId ?? null,
        });
        return;
      }

      const orphanIds: string[] = [CREATION_DRAFT_GEOMETRY_ID];
      const staleViewerId = lastDraftGeometryViewerIdRef.current;
      if (staleViewerId) {
        const inStore = activeGeometriesRef.current.some((geometry) => geometry.id === staleViewerId);
        if (!inStore) {
          orphanIds.push(staleViewerId);
        }
        lastDraftGeometryViewerIdRef.current = null;
      }
      purgeCreationGeometryDrafts(manager, { removeViewerIds: orphanIds });
    }, [creationDraft?.draftGeometryViewerId, isCreationPendingNewGeometry, ref, revision]);

    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) {
        return;
      }
      const annotationManager = ref.current.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!annotationManager) {
        return;
      }
      runStoreOpenLimeSync(annotationManager);
      // Re-apply selection after shape sync — import/redraw can strip the selected CSS class.
      const idsToSelect = highlightGeometryIdsRef.current;
      if (idsToSelect.length > 0) {
        const managerForSelect =
          enableAnnotationEditInteraction() ?? annotationManager;
        applyingProgrammaticSelectionRef.current = true;
        expectedProgrammaticSelectionRef.current = normalizeIds(idsToSelect);
        applyOpenLimeSelection(managerForSelect, idsToSelect, selectionInteractionMode);
        requestAnimationFrame(() => {
          applyingProgrammaticSelectionRef.current = false;
        });
      }
      // A geometry sync can recreate SVG nodes; re-apply remote underEditing classes.
      applyOpenLimeUnderEditing(annotationManager, lockedGeometryIds);
    }, [
      annotationManagerRevision,
      viewerAnnotationsForSync,
      lockedGeometryIds,
      ref,
      enableAnnotationEditInteraction,
    ]);

    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) {
        return;
      }
      const annotationManager = ref.current.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!annotationManager) {
        return;
      }

      annotationManager.setSemanticClasses?.(semanticClassesForFilter, false);
      for (const annotation of viewerAnnotationsForSync) {
        annotationManager.setAnnotationSemanticClass?.(
          annotation.id,
          annotation.semanticClass ?? null,
        );
      }
      annotationManager.viewer?.redraw?.();
    }, [
      annotationManagerRevision,
      semanticClassesForFilter,
      viewerAnnotationsForSync,
      ref,
    ]);

    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) {
        return;
      }
      const annotationManager = ref.current.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!annotationManager) {
        return;
      }
      if (highlightGeometryIds.length === 0 && focusedDataIds.size === 0) {
        applyingProgrammaticSelectionRef.current = true;
        expectedProgrammaticSelectionRef.current = [];
        annotationManager.deselectAll();
        requestAnimationFrame(() => {
          applyingProgrammaticSelectionRef.current = false;
        });
        return;
      }

      if (highlightGeometryIds.length === 0) {
        return;
      }
      if (isPointerDownRef.current) {
        return;
      }
      const managerForSelect =
        enableAnnotationEditInteraction() ?? annotationManager;
      applyingProgrammaticSelectionRef.current = true;
      expectedProgrammaticSelectionRef.current = normalizeIds(highlightGeometryIds);
      applyOpenLimeSelection(managerForSelect, highlightGeometryIds, selectionInteractionMode);
      requestAnimationFrame(() => {
        applyingProgrammaticSelectionRef.current = false;
      });
    }, [
      annotationManagerRevision,
      highlightGeometryIds,
      focusedDataIds,
      ref,
      enableAnnotationEditInteraction,
      selectionInteractionMode,
    ]);

    // Apply toolbar modes during the wizard geometry step; otherwise keep edit-only when pencil is on.
    useEffect(() => {
      if (annotationMode !== 'edit' || !viewerReady) {
        return;
      }
      const viewer = (ref as React.RefObject<OpenLIMEViewerRef>)?.current;
      if (!viewer) {
        return;
      }

      if (isCreationGeometryStep) {
        viewer.enableEditing(true);
        const effectiveMode = resolveToolbarMode();
        if (effectiveMode !== toolbarMode) {
          setToolbarMode(effectiveMode);
        }
        applyToolbarMode(effectiveMode);
        return;
      }

      if (pencilActive) {
        if (toolbarMode !== 'edit') {
          setToolbarMode('edit');
        }
        applyToolbarMode('edit');
      }
    }, [
      annotationMode,
      viewerReady,
      pencilActive,
      isCreationGeometryStep,
      isCreationGeometryNew,
      isCreationGeometrySearch,
      isCreationPendingNewGeometry,
      toolbarMode,
      applyToolbarMode,
      resolveToolbarMode,
      ref,
    ]);

    // Keep editor social locks aligned with this viewer's focused geometries.
    useEffect(() => {
      if (annotationMode !== 'edit') {
        void syncGeometryEditorLocks([]);
        return;
      }
      void syncGeometryEditorLocks([...focusedGeometryIds]);
    }, [annotationMode, focusedGeometryIds, syncGeometryEditorLocks]);

    // Apply remote geometry editor locks as OpenLIME underEditing style.
    useEffect(() => {
      if (!ref || !('current' in ref) || !ref.current) {
        return;
      }
      const annotationManager = ref.current.getAnnotationManager() as OpenLimeAnnotationManager | null;
      if (!annotationManager) {
        return;
      }

      applyOpenLimeUnderEditing(annotationManager, lockedGeometryIds);
    }, [annotationManagerRevision, lockedGeometryIds, ref]);

    useEffect(() => {
      return () => {
        const locked = [...geometryEditorLockIdsRef.current];
        geometryEditorLockIdsRef.current = new Set();
        locked.forEach((id) => {
          void stopEditorLock('geometry', id, 'editing annotation geometry').catch(() => {
            // best-effort cleanup
          });
        });
      };
    }, [stopEditorLock]);

    if (!twoDimensionalAssetAvailable) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            backgroundColor: '#f5f5f5'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📸</div>
            <p style={{ color: '#666', marginBottom: '8px' }}>No 2D assets available</p>
            <p style={{ color: '#999', fontSize: '14px' }}>Please add an image or RTI asset to this project</p>
          </div>
        </div>
      );
    }

    if (!sceneDesc) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            backgroundColor: '#f5f5f5'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📸</div>
            <p style={{ color: '#666', marginBottom: '8px' }}>Scene description not available</p>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{ position: 'relative', width: '100%', height: '100%' }}
        onPointerDown={handleViewerPointerDown}
        onPointerUp={handleViewerPointerUpOrCancel}
        onPointerCancel={handleViewerPointerUpOrCancel}
      >
        <OpenLIMEViewer
          ref={ref}
          sceneDesc={sceneDesc}
          digitalAssets={digitalAssets}
          annotationInteractionMode={annotationMode}
          onReady={handleViewerReady}
          onError={onError}
          onAnnotationCreated={handleAnnotationCreated}
          onAnnotationEditStart={handleAnnotationEditStart}
          onAnnotationUpdated={handleAnnotationUpdated}
          onAnnotationSelectionChanged={handleAnnotationSelectionChange}
          onPencilActiveChange={handlePencilActiveChange}
          onSettingsRequested={() => setSettingsOpen(true)}
          annotationLabelVisibility={labelVisibility}
        />
        {annotationMode === 'edit' && isCreationGeometryStep && viewerReady && (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              pointerEvents: 'auto',
            }}
          >
            <AnnotationToolbar
              mode={toolbarMode}
              onModeChange={applyToolbarMode}
              disabledModes={creationToolbarDisabledModes(
                isCreationGeometryNew,
                isCreationGeometrySearch,
                isCreationPendingNewGeometry,
              )}
            />
          </div>
        )}
        {isDeletionGeometryPickActive && deletionDraft?.pendingResolution?.endpointKind === 'data' ? (
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              pointerEvents: 'auto',
            }}
          >
            <DeletionGeometryPickBar
              selectedCount={deletionDraft.pendingResolution.selectedCounterpartIds.length}
              endpointLabel={(() => {
                const dataId = deletionDraft.pendingResolution.endpointId;
                const datum = activeData.find((entry) => entry.id === dataId);
                return datum?.label?.trim() || dataId;
              })()}
              onConfirm={confirmDeletionCounterpartPick}
              onCancel={cancelDeletionPendingResolution}
            />
          </div>
        ) : null}
        <AppMessageModal
          descriptor={messageModal}
          onClose={releaseConflictSnapshotsAndSync}
          onAction={releaseConflictSnapshotsAndSync}
        />
        <ViewerSettingsModal
          isOpen={settingsOpen}
          labelVisibility={labelVisibility}
          onLabelVisibilityChange={setLabelVisibility}
          onClose={() => setSettingsOpen(false)}
        />
      </div>
    );
  }
);

Viewer2DPanel.displayName = 'Viewer2DPanel';

export default Viewer2DPanel;
