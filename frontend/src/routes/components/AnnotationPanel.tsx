/**
 * AnnotationPanel — lists active {@link AnnotationData} from the store and drives UI focus.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { AnnotationData } from 'shared/annotation-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { getViewerHighlightGeometryIds } from '../../adapters/annotation-store/geometryToViewerAnnotation';
import { ANNOTATION_PANEL_STYLE_CONFIG } from '../../config/annotationStyles.ts';
import AppMessageModal from '../../shared/ui/AppMessageModal';
import {
  AnnotationMessageModalCatalog,
  type MessageModalDescriptor,
} from '../../shared/ui/AnnotationMessageModalModel';

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
  onChange: (patch: Partial<Pick<AnnotationDataDraft, 'label' | 'description'>>) => void;
  onCancel: () => void;
}) {
  if (!draft) {
    return null;
  }

  return (
    <div
      className="modal d-block"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'block',
      }}
      onClick={onCancel}
    >
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Edit annotation data</h5>
            <button type="button" className="btn-close" onClick={onCancel} aria-label="Close" />
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
              <input
                type="text"
                className="form-control"
                id="annotationDescription"
                value={draft.description}
                onChange={(e) => onChange({ description: e.target.value })}
              />
            </div>
            <p className="small text-muted mb-0">
              Class: {draft.annotationClass ?? '(none)'}
            </p>
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
    startEditorLock,
    stopEditorLock,
  } = useAnnotationStore();

  const [editingDraft, setEditingDraft] = useState<AnnotationDataDraft | null>(null);
  const [messageModal, setMessageModal] = useState<MessageModalDescriptor | null>(null);

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
    const usersText =
      users.length === 1
        ? users[0]
        : users.length === 2
          ? `${users[0]} and ${users[1]}`
          : `${users.slice(0, 2).join(', ')} and ${users.length - 2} more users`;

    if (titles.length === 0) {
      return `${usersText} are editing annotations you are editing.`;
    }

    const shownTitles = titles.slice(0, 2).map((title) => `"${title}"`).join(', ');
    const suffix = titles.length > 2 ? ` and ${titles.length - 2} more` : '';
    return `${usersText} are editing the same annotation: ${shownTitles}${suffix}.`;
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
    if (window.confirm('Mark this annotation data as erasable (soft delete)?')) {
      try {
        await markDataErasable(dataId);
      } catch (err) {
        console.error('Failed to mark data erasable:', err);
        setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'delete_data'));
      }
    }
  };

  const handleBulkDelete = async () => {
    if (focusedDataIdList.length === 0) {
      return;
    }
    const count = focusedDataIdList.length;
    if (window.confirm(`Mark ${count} data record${count > 1 ? 's' : ''} as erasable?`)) {
      try {
        await Promise.all(focusedDataIdList.map((id) => markDataErasable(id)));
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
      }, {
        expectedVersion: editingDraft.expectedVersion,
      });
      setEditingDraft(null);
    } catch (err) {
      console.error('Failed to update annotation data:', err);
      setMessageModal(AnnotationMessageModalCatalog.fromError(err, 'update_data'));
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
    return () => {
      if (editingDraft?.dataId) {
        void stopEditorLock('data', editingDraft.dataId, 'editing annotation data');
      }
    };
  }, [editingDraft, stopEditorLock]);

  return (
    <div className="p-3 h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="h4 mb-0">Annotations</h4>
        {focusedDataIdList.length > 0 && (
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={() => void handleBulkDelete()}
              disabled={creating}
            >
              <i className="bi bi-trash me-1"></i>
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
        className={`mb-3 p-2 border rounded small ${
          collaborativeEditInfo
            ? 'bg-danger-subtle border-danger text-danger-emphasis fw-semibold'
            : 'bg-light-subtle text-muted'
        }`}
        style={{ minHeight: '36px' }}
      >
        <div className="d-flex flex-column gap-1 align-items-start">
          <span className={`badge ${realtimeBadgeClass}`}>{realtimeLabel}</span>
          {collaborativeEditInfo ? <div>{collaborativeEditInfo}</div> : null}
        </div>
      </div>

      {activeData.length === 0 ? (
        <div className="flex-grow-1 d-flex align-items-center justify-content-center">
          <p className="text-muted fst-italic text-center">
            No active annotation data. Adjust the query filter or create annotations in the viewer.
          </p>
        </div>
      ) : (
        <div className="flex-grow-1 overflow-auto">
          <div className="list-group">
            {activeData.map((datum) => {
              const linkedCount =
                activeAnnotationSelection.geometryIdsByDataId.get(datum.id)?.length ?? 0;
              const isSelected = isDataFocused(datum.id);
              const isUnderEditing = activeSocialLocks.some((lock) => {
                if (lock.lockKind !== 'editor') {
                  return false;
                }
                return lock.resourceType === 'data' && lock.resourceId === datum.id;
              });

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
                        className="btn btn-sm btn-outline-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(datum.id);
                        }}
                        disabled={creating}
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                  <p className="mb-0 small" style={{ color: itemColors.text }}>
                    {datum.description || '(no description)'}
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
