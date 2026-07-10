/**
 * AnnotationPanelEditor — lists active {@link AnnotationData} from the store and drives UI focus.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnnotationData } from 'shared/annotation-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { AnnotationApiError } from '../../services/AnnotationApiClient';
import { getViewerHighlightGeometryIds } from '../../adapters/annotation-store/geometryToViewerAnnotation';
import { ANNOTATION_PANEL_STYLE_CONFIG } from '../../config/annotationStyles.ts';
import {
  areAnyDataIdsUnderRemoteEditorLock,
  isDataIdUnderEditorLock,
  isDataIdUnderRemoteEditorLock,
} from '../../stores/annotation-social-locks';
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
import AnnotationCreationPanel from '../../features/annotation-creation/AnnotationCreationPanel';
import { buildAnnotationScopeOptions } from '../../features/annotation-creation/buildAnnotationScopeOptions';
import VocabularyClassPicker from '../../shared/ui/VocabularyClassPicker';
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
    <div
      className="modal d-block"
      role="dialog"
      aria-modal="true"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'block',
      }}
    >
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Edit annotation data</h5>
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <label htmlFor="annotationLabel" className="form-label">
                Label
              </label>
              <input
                type="text"
                className="form-control"
                id="annotationLabel"
                value={draft.label}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </div>
            <div className="mb-3">
              <label htmlFor="annotationDescription" className="form-label">
                Description
              </label>
              <textarea
                className="form-control"
                id="annotationDescription"
                value={draft.description}
                onChange={(e) => onChange({ description: e.target.value })}
                rows={6}
                style={{ resize: 'vertical', overflowY: 'auto' }}
              />
            </div>
            <div className="mb-0">
              <label htmlFor="annotationClass" className="form-label">
                Class
              </label>
              <VocabularyClassPicker
                inputId="annotationClass"
                value={draft.annotationClass ?? ''}
                onChange={(value) => onChange({ annotationClass: value })}
                schemes={vocabularySchemes}
                concepts={vocabularyConcepts}
                properties={vocabularyProperties}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onSave}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnnotationPanelEditor({
  onSelectionChanged,
  sceneId,
  sceneLabel,
  sceneAssets = [],
}: AnnotationPanelEditorProps) {
  const {
    activeData,
    allData,
    allLinks,
    activeAnnotationSelection,
    activeSocialLocks,
    currentStreamId,
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
    clearFocus,
    isDataFocused,
    realtimeState,
    creating,
    creationDraft,
    isCreationWizardActive,
    initCreationDraft,
    updateCreationDraft,
    discardCreationDraft,
    beginCreationWizard,
    advanceCreationStep,
    updateData,
    markDataErasable,
    markAnnotationTripletErasable,
    startEditorLock,
    stopEditorLock,
  } = useAnnotationStore();

  const {
    visibleData,
    linkViewMode,
    setLinkViewMode,
    panelShowsFilteredData,
  } = useAnnotationLinkView();

  const [createSectionExpanded, setCreateSectionExpanded] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [discardCreationModal, setDiscardCreationModal] = useState<MessageModalDescriptor | null>(null);

  const scopeOptions = useMemo(
    () => buildAnnotationScopeOptions({ sceneId, sceneLabel, assets: sceneAssets }),
    [sceneAssets, sceneId, sceneLabel],
  );

  const handleCreateSectionToggle = useCallback(() => {
    setCreateSectionExpanded((expanded) => {
      const next = !expanded;
      if (next && !creationDraft) {
        initCreationDraft();
      }
      if (!next) {
        setSetupError(null);
      }
      return next;
    });
  }, [creationDraft, initCreationDraft]);

  const handleBeginCreation = useCallback(() => {
    const result = beginCreationWizard();
    if (!result.ok) {
      setSetupError(result.message);
      return;
    }
    setSetupError(null);
  }, [beginCreationWizard]);

  const handleDiscardCreation = useCallback(() => {
    discardCreationDraft();
    setSetupError(null);
    setDiscardCreationModal(null);
    setCreateSectionExpanded(false);
  }, [discardCreationDraft]);

  const handleCreationBack = useCallback(() => {
    setDiscardCreationModal(new MessageModalDescriptor({
      tone: 'warning',
      title: 'Discard annotation creation?',
      message: 'Going back will cancel the current creation draft.',
      actions: [
        { key: 'cancel', label: 'Keep editing', tone: 'secondary' },
        { key: 'discard', label: 'Discard', tone: 'danger' },
      ],
      dismissOnBackdrop: false,
    }));
  }, []);

  const handleCreationNext = useCallback(async () => {
    setSetupError(null);
    try {
      await advanceCreationStep();
    } catch {
      // store onError surfaces API failures
    }
  }, [advanceCreationStep]);

  const [editingDraft, setEditingDraft] = useState<AnnotationDataDraft | null>(null);
  const [messageModal, setMessageModal] = useState<MessageModalDescriptor | null>(null);
  const editingDataIdRef = useRef<string | null>(null);

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

  const focusedDataIdList = [...focusedDataIds];

  const deleteBlockedTitle =
    'Cannot delete while another user is editing this annotation';

  const deleteButtonClass = (disabled: boolean, size: 'sm' | 'md' = 'sm') =>
    [
      'btn',
      size === 'sm' ? 'btn-sm' : '',
      disabled
        ? 'btn-outline-secondary text-muted annotation-delete-btn--inactive'
        : 'btn-outline-danger',
    ]
      .filter(Boolean)
      .join(' ');

  const bulkDeleteBlocked = useMemo(
    () =>
      areAnyDataIdsUnderRemoteEditorLock(
        focusedDataIdList,
        activeSocialLocks,
        currentStreamId,
        activeAnnotationSelection.geometryIdsByDataId,
        allLinks,
      ),
    [
      focusedDataIdList,
      activeSocialLocks,
      currentStreamId,
      activeAnnotationSelection.geometryIdsByDataId,
      allLinks,
    ],
  );

  const collaborativeEditInfo = useMemo(() => {
    if (!currentStreamId) {
      return '';
    }

    const dataById = new Map(allData.map((datum) => [datum.id, datum]));
    const linkById = new Map(allLinks.map((link) => [link.id, link]));
    const dataIdsByGeometryId = new Map<string, Set<string>>();
    const geometryIdsByDataId = new Map<string, Set<string>>();

    for (const link of allLinks) {
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
    allLinks,
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
    focusData(dataId, e.ctrlKey || e.metaKey);
  };

  const handleDelete = async (dataId: string) => {
    if (
      isDataIdUnderRemoteEditorLock(
        dataId,
        activeSocialLocks,
        currentStreamId,
        activeAnnotationSelection.geometryIdsByDataId,
        allLinks,
      )
    ) {
      return;
    }
    if (window.confirm('Mark annotation triplet (data + link + geometry) as erasable (soft delete)?')) {
      try {
        await markAnnotationTripletErasable(dataId);
      } catch (err) {
        console.error('Failed to mark data erasable:', err);
        setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'delete_data'));
      }
    }
  };

  const handleBulkDelete = async () => {
    if (focusedDataIdList.length === 0 || bulkDeleteBlocked) {
      return;
    }
    const count = focusedDataIdList.length;
    if (window.confirm(`Mark ${count} annotation triplet${count > 1 ? 's' : ''} as erasable?`)) {
      try {
        await Promise.all(focusedDataIdList.map((id) => markAnnotationTripletErasable(id)));
        clearFocus();
      } catch (err) {
        console.error('Failed to delete annotation data:', err);
        setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'delete_data_bulk'));
      }
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

  const hadCreationDraftRef = useRef(false);
  useEffect(() => {
    if (creationDraft) {
      hadCreationDraftRef.current = true;
      return;
    }
    if (hadCreationDraftRef.current) {
      hadCreationDraftRef.current = false;
      setCreateSectionExpanded(false);
      setSetupError(null);
    }
  }, [creationDraft]);

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
      headerRight={focusedDataIdList.length > 0 ? (
        <div className="btn-group btn-group-sm" role="group">
          <button
            type="button"
            className={deleteButtonClass(creating || bulkDeleteBlocked, 'md')}
            onClick={() => void handleBulkDelete()}
            disabled={creating || bulkDeleteBlocked}
            title={bulkDeleteBlocked ? deleteBlockedTitle : undefined}
          >
            <i className="bi bi-trash me-1" aria-hidden />
            Delete ({focusedDataIdList.length})
          </button>
          <button type="button" className="btn btn-outline-secondary" onClick={clearFocus}>
            <i className="bi bi-x-lg" aria-hidden />
          </button>
        </div>
      ) : null}
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
      classFilter={isCreationWizardActive ? null : (
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
          <div className="mb-3">
            <button
              type="button"
              className={`btn btn-sm w-100 ${createSectionExpanded ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={handleCreateSectionToggle}
              aria-expanded={createSectionExpanded}
            >
              <i className={`bi ${createSectionExpanded ? 'bi-chevron-up' : 'bi-plus-lg'} me-1`} aria-hidden />
              Create annotation
            </button>
          </div>
          {createSectionExpanded && creationDraft ? (
            <AnnotationCreationPanel
              draft={creationDraft}
              scopeOptions={scopeOptions}
              creating={creating}
              setupError={setupError}
              onDraftChange={updateCreationDraft}
              onCreate={handleBeginCreation}
              onBack={handleCreationBack}
              onNext={() => void handleCreationNext()}
            />
          ) : null}
          {!isCreationWizardActive ? (
            <AnnotationLinkViewModeToggle
              idPrefix="annotation-editor"
              mode={linkViewMode}
              onChange={setLinkViewMode}
            />
          ) : null}
        </>
      )}
    >

      {/*\n        NOTE: \"show/hide erased\" toggle intentionally disabled for now.\n        Default behavior is to hide erasable entities; later this control will be\n        reintroduced alongside recovery/restore UI.\n\n        <div className=\"mb-3\">\n          <button\n            type=\"button\"\n            className={`btn btn-sm w-100 ${hideErasable ? 'btn-primary' : 'btn-outline-secondary'}`}\n            onClick={handleHideErasableToggle}\n            aria-pressed={hideErasable}\n          >\n            <i className={`bi ${hideErasable ? 'bi-eye-slash' : 'bi-eye'} me-1`} aria-hidden />\n            {hideErasable ? 'Erased hidden' : 'Show all (incl. erased)'}\n          </button>\n        </div>\n      */}

      {isCreationWizardActive ? (
        <div className="flex-grow-1 d-flex align-items-center justify-content-center">
          <p className="text-muted fst-italic text-center px-3">
            Annotation list is hidden while creation is in progress.
            {creationDraft?.step === 'data'
              ? ' Use this area in the next milestone for data search and selection.'
              : ' Use the viewer in the next milestone to draw or select geometries.'}
          </p>
        </div>
      ) : visibleData.length === 0 ? (
        <div className="flex-grow-1 d-flex align-items-center justify-content-center">
          <p className="text-muted fst-italic text-center">
            {activeData.length === 0
              ? 'No active annotation data. Adjust the query filter or create annotations in the viewer.'
              : panelShowsFilteredData && focusedGeometryIds.size === 0 && focusedDataIds.size === 0
              ? 'Select a geometry in the viewer to see linked annotation data.'
              : 'No annotation data matches the current filter.'}
          </p>
        </div>
      ) : (
        <div className="flex-grow-1 overflow-auto">
          <div className="list-group">
            {visibleData.map((datum) => {
              const linkedCount =
                activeAnnotationSelection.geometryIdsByDataId.get(datum.id)?.length ?? 0;
              const isSelected = isDataFocused(datum.id);
              const isUnderEditing = isDataIdUnderEditorLock(
                datum.id,
                activeSocialLocks,
                activeAnnotationSelection.geometryIdsByDataId,
                allLinks,
              );
              const deleteDisabled =
                creating ||
                isDataIdUnderRemoteEditorLock(
                  datum.id,
                  activeSocialLocks,
                  currentStreamId,
                  activeAnnotationSelection.geometryIdsByDataId,
                  allLinks,
                );

              const itemColors = isUnderEditing
                ? {
                    background: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.backgroundUnderEditing,
                    text: ANNOTATION_PANEL_STYLE_CONFIG.dataItem.textUnderEditing,
                  }
                : isSelected
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
                    cursor: 'pointer',
                    backgroundColor: itemColors.background,
                    color: itemColors.text,
                  }}
                >
                  <div className="d-flex flex-column gap-1 w-100">
                    <div className="d-flex justify-content-between align-items-center w-100">
                      <span className="badge bg-secondary">
                        {linkedCount} geom{linkedCount === 1 ? '' : 's'}
                      </span>
                      <div className="d-flex gap-1 flex-shrink-0">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusSelection(
                              { geometryIds: [], dataIds: [datum.id] },
                              () => {
                                void handleEditStart(datum);
                              },
                            );
                          }}
                          disabled={creating}
                        >
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button
                          type="button"
                          className={deleteButtonClass(deleteDisabled)}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDelete(datum.id);
                          }}
                          disabled={deleteDisabled}
                          title={deleteDisabled ? deleteBlockedTitle : undefined}
                          aria-label={
                            deleteDisabled ? 'Delete unavailable (annotation under edit)' : 'Delete annotation'
                          }
                        >
                          <i className="bi bi-trash" aria-hidden />
                        </button>
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
      <AppMessageModal
        descriptor={discardCreationModal}
        onClose={() => {
          setDiscardCreationModal(null);
        }}
        onAction={(actionKey) => {
          if (actionKey === 'discard') {
            handleDiscardCreation();
            return;
          }
          setDiscardCreationModal(null);
        }}
      />
    </AnnotationPanelBase>
  );
}
