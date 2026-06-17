/**
 * AnnotationPanel — lists active {@link AnnotationData} from the store and drives UI focus.
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

interface AnnotationPanelProps {
  /** Optional callback with geometry ids to highlight in the viewer (derived from data focus). */
  onSelectionChanged?: (geometryIds: string[]) => void;
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
}: {
  draft: AnnotationDataDraft | null;
  onSave: () => void;
  onChange: (patch: Partial<Pick<AnnotationDataDraft, 'label' | 'description' | 'annotationClass'>>) => void;
  onCancel: () => void;
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
              <input
                type="text"
                className="form-control"
                id="annotationClass"
                value={draft.annotationClass ?? ''}
                onChange={(e) => onChange({ annotationClass: e.target.value })}
                placeholder="Optional classification"
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

export default function AnnotationPanel({ onSelectionChanged }: AnnotationPanelProps) {
  const {
    activeData,
    allData,
    allLinks,
    activeAnnotationSelection,
    activeSocialLocks,
    currentStreamId,
    sceneAnnotationClassPool,
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
    updateData,
    markDataErasable,
    markAnnotationTripletErasable,
    startEditorLock,
    stopEditorLock,
  } = useAnnotationStore();

  const [editingDraft, setEditingDraft] = useState<AnnotationDataDraft | null>(null);
  const [messageModal, setMessageModal] = useState<MessageModalDescriptor | null>(null);
  const [classPoolSearch, setClassPoolSearch] = useState('');
  const [classPoolExpanded, setClassPoolExpanded] = useState(false);
  const [manualClassFilterInput, setManualClassFilterInput] = useState('');
  const [onlySelectedGeometryData, setOnlySelectedGeometryData] = useState(false);
  const editingDataIdRef = useRef<string | null>(null);

  const filteredActiveData = useMemo(() => {
    if (annotationClassFilterValues.length === 0) {
      return activeData;
    }

    const allowedClasses = new Set(annotationClassFilterValues);
    return activeData.filter((datum) => datum.class !== null && allowedClasses.has(datum.class));
  }, [activeData, annotationClassFilterValues]);

  const visibleData = useMemo(() => {
    if (!onlySelectedGeometryData) {
      return filteredActiveData;
    }
    if (focusedGeometryIds.size === 0) {
      return [];
    }

    const allowedDataIds = new Set<string>();
    for (const geometryId of focusedGeometryIds) {
      for (const dataId of activeAnnotationSelection.dataIdsByGeometryId.get(geometryId) ?? []) {
        allowedDataIds.add(dataId);
      }
    }
    return filteredActiveData.filter((datum) => allowedDataIds.has(datum.id));
  }, [
    onlySelectedGeometryData,
    filteredActiveData,
    focusedGeometryIds,
    activeAnnotationSelection.dataIdsByGeometryId,
  ]);

  const visibleClassPool = useMemo(() => {
    const needle = classPoolSearch.trim().toLowerCase();
    if (!needle) {
      return sceneAnnotationClassPool;
    }
    return sceneAnnotationClassPool.filter((option) =>
      option.curie.toLowerCase().includes(needle) || option.label.toLowerCase().includes(needle),
    );
  }, [classPoolSearch, sceneAnnotationClassPool]);

  useEffect(() => {
    setManualClassFilterInput(annotationClassFilterValues.join(', '));
  }, [annotationClassFilterValues]);

  const commitManualClassFilterInput = useCallback(() => {
    const values = manualClassFilterInput
      .split(/[,\n]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    setAnnotationClassFilterValues(values);
  }, [manualClassFilterInput, setAnnotationClassFilterValues]);

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

  useEffect(() => {
    return () => {
      if (editingDataIdRef.current) {
        void stopEditorLock('data', editingDataIdRef.current, 'editing annotation data');
      }
    };
  }, [stopEditorLock]);

  return (
    <div className="p-3 h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="h4 mb-0">Annotations</h4>
        {focusedDataIdList.length > 0 && (
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
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        )}
      </div>

      {/*\n        NOTE: \"show/hide erased\" toggle intentionally disabled for now.\n        Default behavior is to hide erasable entities; later this control will be\n        reintroduced alongside recovery/restore UI.\n\n        <div className=\"mb-3\">\n          <button\n            type=\"button\"\n            className={`btn btn-sm w-100 ${hideErasable ? 'btn-primary' : 'btn-outline-secondary'}`}\n            onClick={handleHideErasableToggle}\n            aria-pressed={hideErasable}\n          >\n            <i className={`bi ${hideErasable ? 'bi-eye-slash' : 'bi-eye'} me-1`} aria-hidden />\n            {hideErasable ? 'Erased hidden' : 'Show all (incl. erased)'}\n          </button>\n        </div>\n      */}

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

      <div className="mb-3 d-flex flex-column gap-2">
        <div className="d-flex justify-content-between align-items-center gap-2">
          <label htmlFor="annotation-class-filter-input" className="form-label small fw-semibold mb-0">
            Class filter
          </label>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm py-0 px-2"
              onClick={clearAnnotationClassFilter}
              disabled={annotationClassFilterMode === 'none' && annotationClassFilterValues.length === 0}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm py-0 px-2"
              onClick={() => setClassPoolExpanded((current) => !current)}
              aria-expanded={classPoolExpanded}
              aria-controls="annotation-class-chip-pool"
            >
              {classPoolExpanded ? 'Hide classes' : 'Show classes'}
            </button>
          </div>
        </div>
        <input
          id="annotation-class-filter-input"
          type="text"
          className="form-control form-control-sm"
          value={manualClassFilterInput}
          onChange={(e) => setManualClassFilterInput(e.target.value)}
          onBlur={commitManualClassFilterInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitManualClassFilterInput();
            }
          }}
          placeholder="CURIEs separated by commas"
        />
        {classPoolExpanded && (
          <div
            id="annotation-class-chip-pool"
            className="border rounded p-2 bg-light-subtle d-flex flex-column gap-2"
          >
            <input
              type="text"
              className="form-control form-control-sm"
              value={classPoolSearch}
              onChange={(e) => setClassPoolSearch(e.target.value)}
              placeholder="Search among classes present in this scene"
            />
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className={`btn btn-sm ${annotationClassFilterMode === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={selectAllAnnotationClassFilters}
                disabled={sceneAnnotationClassPool.length === 0}
              >
                ALL
              </button>
              {visibleClassPool.map((option) => {
                const selected = annotationClassFilterValues.includes(option.curie);
                return (
                  <button
                    key={option.curie}
                    type="button"
                    className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => toggleAnnotationClassFilterValue(option.curie)}
                    title={option.curie}
                    style={{
                      borderColor: option.color,
                      boxShadow: selected ? `inset 0 0 0 1px ${option.color}` : 'none',
                    }}
                  >
                    <span
                      aria-hidden
                      className="me-1 align-middle d-inline-block rounded-circle"
                      style={{
                        width: '0.7rem',
                        height: '0.7rem',
                        backgroundColor: option.color,
                        verticalAlign: 'middle',
                      }}
                    />
                    {option.label} ({option.dataCount})
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {sceneAnnotationClassPool.length === 0 && (
          <div className="text-muted small">No classified annotation data in this scene.</div>
        )}
      </div>

      <div className="mb-3 form-check">
        <input
          className="form-check-input"
          type="checkbox"
          id="annotation-panel-only-selected-geometry-data"
          checked={onlySelectedGeometryData}
          onChange={(e) => setOnlySelectedGeometryData(e.target.checked)}
        />
        <label className="form-check-label small" htmlFor="annotation-panel-only-selected-geometry-data">
          Show only data linked to selected geometries
        </label>
      </div>

      {visibleData.length === 0 ? (
        <div className="flex-grow-1 d-flex align-items-center justify-content-center">
          <p className="text-muted fst-italic text-center">
            {activeData.length === 0
              ? 'No active annotation data. Adjust the query filter or create annotations in the viewer.'
              : onlySelectedGeometryData && focusedGeometryIds.size === 0
              ? 'No geometry selected.'
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
                  <div className="d-flex justify-content-between align-items-center w-100">
                    <h5
                      className="mb-1 flex-grow-1"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: itemColors.text,
                      }}
                    >
                      {datum.label}
                    </h5>
                    <div className="ms-2 d-flex gap-1 flex-shrink-0">
                      <span className="badge bg-secondary">
                        {linkedCount} geom{linkedCount === 1 ? '' : 's'}
                      </span>
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
                  <p className="mb-0 small" style={{ color: itemColors.text }}>
                    {datum.description || '(no description)'}
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
    </div>
  );
}
