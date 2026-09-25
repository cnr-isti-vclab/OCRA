/**
 * AnnotationPanelEditor — browse / edit / list for active {@link AnnotationData}.
 * Creation and (soon) unlink/delete authoring live in AnnotationWorkbench.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnnotationData } from 'shared/annotation-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { AnnotationApiError } from '../../services/AnnotationApiClient';
import { getViewerHighlightGeometryIds } from '../../adapters/annotation-store/geometryToViewerAnnotation';
import { ANNOTATION_PANEL_STYLE_CONFIG } from '../../config/annotationStyles.ts';
import {
  isDataIdUnderEditorLock,
} from '../../stores/annotation-social-locks';
import { isRecoverableRenderingMode } from '../../stores/annotation-rendering';
import AppMessageModal from '../../shared/ui/AppMessageModal';
import {
  AnnotationMessageModalCatalog,
} from '../../shared/ui/AnnotationMessageModalCatalog';
import {
  MessageModalDescriptor,
} from '../../shared/ui/AppMessageModalModel';
import AnnotationPanelBase from './AnnotationPanelBase';
import AnnotationClassFilter from './AnnotationClassFilter';
import AnnotationLinkViewModeToggle from '../../components/AnnotationLinkViewModeToggle';
import { useAnnotationLinkView } from '../../features/annotation-link-view/useAnnotationLinkView';
import AnnotationDataFormModal from '../../features/annotation-creation/AnnotationDataFormModal';
import { useAnnotationDeletionWizard } from '../../features/annotation-deletion/useAnnotationDeletionWizard';
import { applyDeletionDataPick } from '../../features/annotation-deletion/applyDeletionDataPick';
import type {
  VocabularyConcept,
  VocabularyProperty,
  VocabularyScheme,
} from '../../types/vocabulary';

interface AnnotationPanelEditorProps {
  /** Optional callback with geometry ids to highlight in the viewer (derived from data focus). */
  onSelectionChanged?: (geometryIds: string[]) => void;
  sceneId: string;
  sceneLabel?: string;
  sceneAssets?: Array<{ id: string; label: string }>;
  /** Opens the dockable annotation workbench for creation. */
  onOpenCreationWorkbench: () => void;
  /** Opens the dockable annotation workbench for unlink/delete. */
  onOpenDeletionWorkbench: () => void;
}

interface AnnotationDataDraft {
  dataId: string;
  expectedVersion: number;
  label: string;
  description: string;
  annotationClass: string | null;
  content: Record<string, unknown>;
}

function EditDataModal({
  draft,
  onSave,
  onChange,
  onCancel,
  vocabularySchemes,
  vocabularyConcepts,
  vocabularyProperties,
}: {
  draft: AnnotationDataDraft | null;
  onSave: () => void;
  onChange: (patch: Partial<Pick<AnnotationDataDraft, 'label' | 'description' | 'annotationClass'>>) => void;
  onCancel: () => void;
  vocabularySchemes: readonly VocabularyScheme[];
  vocabularyConcepts: readonly VocabularyConcept[];
  vocabularyProperties: readonly VocabularyProperty[];
}) {
  if (!draft) {
    return null;
  }

  return (
    <AnnotationDataFormModal
      title="Edit annotation data"
      saveLabel="Save"
      values={{
        label: draft.label,
        description: draft.description,
        annotationClass: draft.annotationClass,
      }}
      onChange={onChange}
      onSave={onSave}
      onCancel={onCancel}
      vocabularySchemes={vocabularySchemes}
      vocabularyConcepts={vocabularyConcepts}
      vocabularyProperties={vocabularyProperties}
    />
  );
}

export default function AnnotationPanelEditor({
  onSelectionChanged,
  onOpenCreationWorkbench,
  onOpenDeletionWorkbench,
}: AnnotationPanelEditorProps) {
  const {
    activeData,
    allData,
    allLinks,
    activeLinks,
    activeAnnotationSelection,
    activeSocialLocks,
    currentStreamId,
    showErased,
    setShowErased,
    sceneAnnotationClassPool,
    vocabularySchemes,
    vocabularyConcepts,
    vocabularyProperties,
    annotationClassFilterMode,
    annotationClassFilterValues,
    setAnnotationClassFilterValues,
    toggleAnnotationClassFilterValue,
    selectAllAnnotationClassFilters,
    clearAnnotationClassFilter,
    getLatestMutationForEntity,
    focusedGeometryIds,
    focusedDataIds,
    focusData,
    setFocusSelection,
    isDataFocused,
    realtimeState,
    creating,
    creationDraft,
    isCreationWizardActive,
    deletionDraft,
    isDeletionWizardActive,
    updateData,
    markDataNonErasable,
    markGeometryNonErasable,
    startEditorLock,
    stopEditorLock,
  } = useAnnotationStore();

  const {
    visibleData,
    linkViewMode,
    setLinkViewMode,
    panelShowsFilteredData,
  } = useAnnotationLinkView();

  const {
    isDeletionSelectingStep,
    isDeletionGeometryPickActive,
    deletionHighlightDataIds,
    addDataToDeletionBasket,
    addLinkOnlyFromEndpoint,
    deselectDataFromDeletionBasket,
    reportDeletionSelectionBlocked,
  } = useAnnotationDeletionWizard();

  const deletionHighlightDataIdSet = useMemo(
    () => new Set(deletionHighlightDataIds ?? []),
    [deletionHighlightDataIds],
  );

  const [editingDraft, setEditingDraft] = useState<AnnotationDataDraft | null>(null);
  const [messageModal, setMessageModal] = useState<MessageModalDescriptor | null>(null);
  const editingDataIdRef = useRef<string | null>(null);

  const handleOpenCreationWorkbench = useCallback(() => {
    if (isDeletionWizardActive || deletionDraft) {
      return;
    }
    onOpenCreationWorkbench();
  }, [deletionDraft, isDeletionWizardActive, onOpenCreationWorkbench]);

  const handleOpenDeletionWorkbench = useCallback(() => {
    if (isCreationWizardActive || isDeletionWizardActive || creationDraft || deletionDraft) {
      return;
    }
    onOpenDeletionWorkbench();
  }, [creationDraft, deletionDraft, isCreationWizardActive, isDeletionWizardActive, onOpenDeletionWorkbench]);

  // Class filter UI is handled by the shared `AnnotationClassFilter` component.

  const realtimeBadgeClass =
    realtimeState === 'connected'
      ? 'bg-success-subtle text-success'
      : realtimeState === 'reconnecting' || realtimeState === 'connecting'
        ? 'bg-warning-subtle text-warning'
        : realtimeState === 'error'
          ? 'bg-danger-subtle text-danger'
          : 'bg-secondary-subtle text-secondary';

  const realtimeLabel =
    realtimeState === 'connected'
      ? 'Connected'
      : realtimeState === 'reconnecting'
        ? 'Reconnecting...'
        : realtimeState === 'connecting'
          ? 'Connecting...'
          : realtimeState === 'error'
            ? 'Network error'
            : 'Disconnected';


  const collaborativeEditInfo = useMemo(() => {
    if (!currentStreamId) {
      return '';
    }

    const dataById = new Map(allData.map((datum) => [datum.id, datum]));
    const linkById = new Map(activeLinks.map((link) => [link.id, link]));
    const dataIdsByGeometryId = new Map<string, Set<string>>();
    const geometryIdsByDataId = new Map<string, Set<string>>();

    for (const link of activeLinks) {
      const byGeometry = dataIdsByGeometryId.get(link.geometryId) ?? new Set<string>();
      byGeometry.add(link.dataId);
      dataIdsByGeometryId.set(link.geometryId, byGeometry);

      const byData = geometryIdsByDataId.get(link.dataId) ?? new Set<string>();
      byData.add(link.geometryId);
      geometryIdsByDataId.set(link.dataId, byData);
    }

    const targetGeometryIds = new Set<string>(focusedGeometryIds);
    const targetDataIds = new Set<string>(focusedDataIds);

    for (const dataId of targetDataIds) {
      for (const geometryId of geometryIdsByDataId.get(dataId) ?? []) {
        targetGeometryIds.add(geometryId);
      }
    }

    for (const geometryId of targetGeometryIds) {
      for (const dataId of dataIdsByGeometryId.get(geometryId) ?? []) {
        targetDataIds.add(dataId);
      }
    }

    if (targetGeometryIds.size === 0 && targetDataIds.size === 0) {
      return '';
    }

    const overlapUsers = new Set<string>();
    const overlapTitles = new Set<string>();
    const overlapResourceTypes = new Set<'geometry' | 'data' | 'link'>();

    for (const lock of activeSocialLocks) {
      if (lock.lockKind !== 'editor' || !lock.resourceType || !lock.resourceId) {
        continue;
      }
      if (lock.streamId === currentStreamId) {
        continue;
      }

      let conflictsWithFocus = false;
      if (lock.resourceType === 'geometry') {
        conflictsWithFocus = targetGeometryIds.has(lock.resourceId);
        if (conflictsWithFocus) {
          overlapResourceTypes.add('geometry');
          for (const dataId of dataIdsByGeometryId.get(lock.resourceId) ?? []) {
            const datum = dataById.get(dataId);
            if (datum?.label?.trim()) {
              overlapTitles.add(datum.label.trim());
            }
          }
        }
      } else if (lock.resourceType === 'data') {
        conflictsWithFocus = targetDataIds.has(lock.resourceId);
        if (conflictsWithFocus) {
          overlapResourceTypes.add('data');
          const datum = dataById.get(lock.resourceId);
          if (datum?.label?.trim()) {
            overlapTitles.add(datum.label.trim());
          }
        }
      } else if (lock.resourceType === 'link') {
        const link = linkById.get(lock.resourceId);
        if (!link) {
          continue;
        }
        conflictsWithFocus = targetGeometryIds.has(link.geometryId) || targetDataIds.has(link.dataId);
        if (conflictsWithFocus) {
          overlapResourceTypes.add('link');
          const datum = dataById.get(link.dataId);
          if (datum?.label?.trim()) {
            overlapTitles.add(datum.label.trim());
          }
        }
      }

      if (conflictsWithFocus) {
        overlapUsers.add(lock.username);
      }
    }

    if (overlapUsers.size === 0) {
      return '';
    }

    const users = [...overlapUsers];
    const titles = [...overlapTitles];
    const quotedUsers = users.map((user) => `"${user}"`);
    const usersText = quotedUsers.length === 1
      ? quotedUsers[0]
      : `${quotedUsers.slice(0, -1).join(', ')} and ${quotedUsers[quotedUsers.length - 1]}`;

    const overlapHasGeometry = overlapResourceTypes.has('geometry');
    const overlapHasData = overlapResourceTypes.has('data');
    const overlapHasLink = overlapResourceTypes.has('link');

    const annotationScope = overlapHasGeometry && !overlapHasData && !overlapHasLink
      ? 'geometry annotation'
      : overlapHasData && !overlapHasGeometry && !overlapHasLink
        ? 'data annotation'
        : 'annotation';

    const userNoun = users.length === 1 ? 'User' : 'Users';
    const verb = users.length === 1 ? 'is' : 'are';

    if (titles.length === 0) {
      return `${userNoun} ${usersText} ${verb} editing the same ${annotationScope}.`;
    }

    const shownTitles = titles.map((title) => `"${title}"`).join(', ');
    return `${userNoun} ${usersText} ${verb} editing the same ${annotationScope}: ${shownTitles}.`;
  }, [
    activeSocialLocks,
    allData,
    activeLinks,
    currentStreamId,
    focusedDataIds,
    focusedGeometryIds,
  ]);

  useEffect(() => {
    if (onSelectionChanged) {
      onSelectionChanged(
        getViewerHighlightGeometryIds(
          focusedGeometryIds,
          focusedDataIds,
          activeAnnotationSelection,
        ),
      );
    }
  }, [focusedGeometryIds, focusedDataIds, activeAnnotationSelection, onSelectionChanged]);

  const handleDataClick = (dataId: string, e: React.MouseEvent) => {
    if (isDeletionSelectingStep && deletionDraft) {
      e.stopPropagation();
      if (isRecoverableRenderingMode(activeAnnotationSelection.renderingModeByDataId.get(dataId))) {
        reportDeletionSelectionBlocked('Erased annotations can only be restored, not deleted again.');
        return;
      }
      applyDeletionDataPick(
        dataId,
        deletionDraft,
        {
          addDataToDeletionBasket,
          addLinkOnlyFromEndpoint,
          deselectDataFromDeletionBasket,
          reportDeletionSelectionBlocked,
        },
        {
          activeSocialLocks,
          currentStreamId,
          links: allLinks,
          geometryIdsByDataId: activeAnnotationSelection.geometryIdsByDataId,
        },
        {
          toggle: e.ctrlKey || e.metaKey,
          links: allLinks,
        },
      );
      return;
    }
    focusData(dataId, e.ctrlKey || e.metaKey);
  };

  const handleRestoreData = async (datum: AnnotationData) => {
    try {
      await markDataNonErasable(datum.id);
    } catch (err) {
      console.error('Failed to restore annotation data:', err);
      setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'update_data'));
    }
  };

  const focusedRecoverableGeometryIds = useMemo(
    () =>
      [...focusedGeometryIds].filter((id) =>
        isRecoverableRenderingMode(activeAnnotationSelection.renderingModeByGeometryId.get(id)),
      ),
    [activeAnnotationSelection.renderingModeByGeometryId, focusedGeometryIds],
  );

  const handleRestoreFocusedRecoverableGeometries = async () => {
    try {
      await Promise.all(focusedRecoverableGeometryIds.map((id) => markGeometryNonErasable(id)));
    } catch (err) {
      console.error('Failed to restore annotation geometry:', err);
      setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'update_data'));
    }
  };

  const handleEditSave = async () => {
    if (!editingDraft) {
      return;
    }

    try {
      await updateData(editingDraft.dataId, {
        label: editingDraft.label,
        description: editingDraft.description,
        class: editingDraft.annotationClass?.trim().length
          ? editingDraft.annotationClass.trim()
          : null,
      }, {
        expectedVersion: editingDraft.expectedVersion,
      });
      setEditingDraft(null);
    } catch (err) {
      console.error('Failed to update annotation data:', err);
      if (err instanceof AnnotationApiError && err.status === 409 && err.code === 'annotation.data.version_conflict') {
        const latestMutation = getLatestMutationForEntity('data', editingDraft.dataId);
        if (latestMutation?.mutation === 'data.erasable') {
          setMessageModal(new MessageModalDescriptor({
            tone: 'warning',
            title: 'Annotation deleted',
            message: `This annotation was deleted by User "${latestMutation.username}" while you were editing. Your changes were not applied.`,
          }));
        } else if (latestMutation?.username) {
          setMessageModal(new MessageModalDescriptor({
            tone: 'warning',
            title: 'Version conflict (409)',
            message: `User "${latestMutation.username}" saved a newer version while you were editing. Your changes were not applied. Please review the latest data and retry.`,
          }));
        } else {
          setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'update_data'));
        }
      } else {
        setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'update_data'));
      }
    } finally {
      try {
        await stopEditorLock('data', editingDraft.dataId, 'editing annotation data');
      } catch (lockErr) {
        console.warn('Failed to release data editor lock:', lockErr);
      }
    }
  };

  const handleEditStart = async (datum: AnnotationData) => {
    if (isRecoverableRenderingMode(activeAnnotationSelection.renderingModeByDataId.get(datum.id))) {
      return;
    }
    setEditingDraft({
      dataId: datum.id,
      expectedVersion: datum.version,
      label: datum.label,
      description: datum.description ?? '',
      annotationClass: datum.class ?? null,
      content: { ...datum.content },
    });
    try {
      await startEditorLock('data', datum.id, 'editing annotation data');
    } catch (lockErr) {
      console.warn('Failed to publish data editor lock:', lockErr);
      setMessageModal(AnnotationMessageModalCatalog.fromError(lockErr, 'editor_lock_start'));
    }
  };

  const handleEditCancel = async () => {
    const datumId = editingDraft?.dataId;
    setEditingDraft(null);
    if (!datumId) {
      return;
    }
    try {
      await stopEditorLock('data', datumId, 'editing annotation data');
    } catch (lockErr) {
      console.warn('Failed to release data editor lock:', lockErr);
      setMessageModal(AnnotationMessageModalCatalog.fromError(lockErr, 'editor_lock_stop'));
    }
  };

  useEffect(() => {
    editingDataIdRef.current = editingDraft?.dataId ?? null;
  }, [editingDraft?.dataId]);

  useEffect(() => {
    return () => {
      if (editingDataIdRef.current) {
        void stopEditorLock('data', editingDataIdRef.current, 'editing annotation data');
      }
    };
  }, [stopEditorLock]);

  return (
    <AnnotationPanelBase
      title="Annotations"
      status={
        <div
          className={`mb-3 p-2 border rounded small annotation-panel-status ${
            collaborativeEditInfo
              ? 'bg-danger-subtle border-danger text-danger-emphasis fw-semibold'
              : 'bg-light-subtle text-muted'
          }`}
          style={{ minHeight: collaborativeEditInfo ? '64px' : '48px' }}
        >
          <div className="d-flex flex-column gap-1 annotation-panel-status__content">
            <span className={`badge annotation-panel-status__badge ${realtimeBadgeClass}`}>{realtimeLabel}</span>
            {collaborativeEditInfo ? (
              <div className="annotation-panel-status__message">{collaborativeEditInfo}</div>
            ) : null}
          </div>
        </div>
      }
      classFilter={isCreationWizardActive || isDeletionWizardActive ? null : (
        <AnnotationClassFilter
          idPrefix="annotation-editor"
          pool={sceneAnnotationClassPool}
          filterMode={annotationClassFilterMode}
          filterValues={annotationClassFilterValues}
          setFilterValues={setAnnotationClassFilterValues}
          toggleFilterValue={toggleAnnotationClassFilterValue}
          selectAllFilters={selectAllAnnotationClassFilters}
          clearFilter={clearAnnotationClassFilter}
        />
      )}
      toggle={(
        <>
          <div className="mb-2 d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm flex-fill btn-outline-primary"
              onClick={handleOpenCreationWorkbench}
              disabled={Boolean(deletionDraft) || isDeletionWizardActive || isCreationWizardActive}
              title={
                deletionDraft || isDeletionWizardActive
                  ? 'Finish or cancel unlink/delete before creating'
                  : isCreationWizardActive
                  ? 'Close the annotation workbench before starting a new session'
                  : undefined
              }
            >
              <i className="bi bi-plus-lg me-1" aria-hidden />
              Annotate
            </button>
            <button
              type="button"
              className="btn btn-sm flex-fill btn-outline-danger"
              onClick={handleOpenDeletionWorkbench}
              disabled={Boolean(creationDraft) || isCreationWizardActive || Boolean(deletionDraft) || isDeletionWizardActive}
              title={
                deletionDraft || isDeletionWizardActive
                  ? 'Close the workbench before starting a new unlink/delete session'
                  : creationDraft || isCreationWizardActive
                    ? 'Finish or cancel creation before unlinking or deleting'
                    : undefined
              }
            >
              <i className="bi bi-trash me-1" aria-hidden />
              Unlink/Delete
            </button>
          </div>
          {!isCreationWizardActive && !isDeletionWizardActive ? (
            <AnnotationLinkViewModeToggle
              idPrefix="annotation-editor"
              mode={linkViewMode}
              onChange={setLinkViewMode}
            />
          ) : null}
        </>
      )}
    >

      {!isCreationWizardActive && !isDeletionWizardActive && linkViewMode === 'showAll' ? (
        <div className="mb-3">
          <button
            type="button"
            className={`btn btn-sm w-100 ${showErased ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setShowErased(!showErased)}
            aria-pressed={showErased}
          >
            <i className={`bi ${showErased ? 'bi-eye' : 'bi-eye-slash'} me-1`} aria-hidden />
            Show geometry without links
          </button>
        </div>
      ) : null}

      {visibleData.length === 0 ? (
        <div className="flex-grow-1 d-flex align-items-center justify-content-center">
          <p className="text-muted fst-italic text-center">
            {activeData.length === 0
              ? 'No active annotation data. Adjust the query filter or create annotations in the viewer.'
              : isDeletionGeometryPickActive
              ? 'The selected data annotation is not visible in this scene.'
              : panelShowsFilteredData && focusedGeometryIds.size === 0 && focusedDataIds.size === 0
              ? 'Select a geometry in the viewer to see linked annotation data.'
              : panelShowsFilteredData
              ? 'The selected geometry has no linked data matching the active filter.'
              : 'No annotation data matches the current filter.'}
          </p>
        </div>
      ) : (
        <div className="flex-grow-1 overflow-auto">
          {isDeletionGeometryPickActive ? (
            <div className="alert alert-info py-2 px-3 small mb-2">
              Selecting geometries for the annotation below. Other data rows are hidden until you press OK or Cancel.
            </div>
          ) : null}
          {focusedRecoverableGeometryIds.length > 0 ? (
            <div className="alert alert-secondary py-2 px-3 small mb-2 d-flex justify-content-between align-items-center gap-2">
              <span>
                Selected geometry is erased (ghost or orphan). Restore it to edit again.
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary flex-shrink-0"
                onClick={() => {
                  void handleRestoreFocusedRecoverableGeometries();
                }}
              >
                <i className="bi bi-arrow-counterclockwise me-1" aria-hidden />
                Restore
              </button>
            </div>
          ) : null}
          <div className="list-group">
            {visibleData.map((datum) => {
              const linkedCount =
                activeAnnotationSelection.geometryIdsByDataId.get(datum.id)?.length ?? 0;
              const renderingMode = activeAnnotationSelection.renderingModeByDataId.get(datum.id);
              const isGhost = renderingMode === 'ghost';
              const isOrphan = renderingMode === 'none';
              const isRecoverable = isGhost || isOrphan;
              const isSelected = isDeletionSelectingStep
                ? deletionHighlightDataIdSet.has(datum.id)
                : isDataFocused(datum.id);
              const isPickFocus = isDeletionGeometryPickActive
                && deletionDraft?.pendingResolution?.endpointId === datum.id;
              const isUnderEditing = !isRecoverable && isDataIdUnderEditorLock(
                datum.id,
                activeSocialLocks,
                activeAnnotationSelection.geometryIdsByDataId,
                activeLinks,
              );

              const itemColors = isUnderEditing
                ? {
                    background: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.backgroundUnderEditing,
                    text: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.textUnderEditing,
                  }
                : isGhost
                ? {
                    background: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.backgroundGhost,
                    text: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.textGhost,
                  }
                : isOrphan
                ? {
                    background: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.backgroundOrphan,
                    text: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.textOrphan,
                  }
                : isSelected || isPickFocus
                ? {
                    background: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.backgroundSelected,
                    text: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.textSelected,
                  }
                : {
                    background: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.background,
                    text: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.text,
                  };
              return (
                <div
                  key={datum.id}
                  className="list-group-item list-group-item-action d-flex flex-column align-items-stretch"
                  onClick={(e) => handleDataClick(datum.id, e)}
                  style={{
                    cursor: isDeletionGeometryPickActive ? 'default' : 'pointer',
                    backgroundColor: itemColors.background,
                    color: itemColors.text,
                    outline: isPickFocus ? '2px solid var(--bs-primary)' : undefined,
                    outlineOffset: isPickFocus ? '-2px' : undefined,
                    opacity: isRecoverable ? 0.92 : undefined,
                  }}
                >
                  <div className="d-flex flex-column gap-1 w-100">
                    <div className="d-flex justify-content-between align-items-center w-100">
                      <div className="d-flex gap-1 align-items-center">
                        <span className={`badge ${linkedCount === 0 && !isRecoverable ? 'text-bg-light border' : 'bg-secondary'}`}>
                          {linkedCount === 0 && !isRecoverable
                            ? 'Available · no links'
                            : `${linkedCount} geom${linkedCount === 1 ? '' : 's'}`}
                        </span>
                        {isGhost ? (
                          <span className="badge text-bg-light border">ghost</span>
                        ) : null}
                        {isOrphan ? (
                          <span className="badge text-bg-light border">orphan</span>
                        ) : null}
                      </div>
                      <div className="d-flex gap-1 flex-shrink-0">
                        {isRecoverable ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            title="Restore erased annotation data"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRestoreData(datum);
                            }}
                            disabled={creating || isDeletionWizardActive}
                          >
                            <i className="bi bi-arrow-counterclockwise"></i>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFocusSelection(
                                {
                                  geometryIds: [],
                                  dataIds: [datum.id],
                                  primary: { kind: 'data', id: datum.id },
                                },
                                () => {
                                  void handleEditStart(datum);
                                },
                              );
                            }}
                            disabled={creating || isDeletionWizardActive}
                          >
                            <i className="bi bi-pencil"></i>
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      className="fw-bold small"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: itemColors.text,
                      }}
                    >
                      {datum.label}
                    </div>
                  </div>
                  <p className="mb-0 small" style={{ color: itemColors.text }}>
                    {datum.description || ''}
                  </p>
                  <p className="mb-0 small" style={{ color: itemColors.text }}>
                    <strong>Class:</strong> {datum.class ?? '(no class)'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EditDataModal
        draft={editingDraft}
        vocabularySchemes={vocabularySchemes}
        vocabularyConcepts={vocabularyConcepts}
        vocabularyProperties={vocabularyProperties}
        onSave={() => {
          void handleEditSave();
        }}
        onChange={(patch) => {
          setEditingDraft((current) => (current ? { ...current, ...patch } : current));
        }}
        onCancel={() => {
          void handleEditCancel();
        }}
      />
      <AppMessageModal
        descriptor={messageModal}
        onClose={() => {
          setMessageModal(null);
        }}
      />
    </AnnotationPanelBase>
  );
}
