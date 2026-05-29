/**
 * AnnotationPanel — lists active {@link AnnotationData} from the store and drives UI focus.
 */

import React, { useEffect, useState } from 'react';
import type { AnnotationData } from 'shared/annotation-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { getViewerHighlightGeometryIds } from '../../adapters/annotation-store/geometryToViewerAnnotation';
import { ANNOTATION_PANEL_STYLE_CONFIG } from '../../config/annotationStyles.ts';

interface AnnotationPanelProps {
  /** Optional callback with geometry ids to highlight in the viewer (derived from data focus). */
  onSelectionChanged?: (geometryIds: string[]) => void;
}

function EditDataModal({
  datum,
  isOpen,
  onSave,
  onCancel,
}: {
  datum: AnnotationData | null;
  isOpen: boolean;
  onSave: (dataId: string, label: string, description: string) => void;
  onCancel: () => void;
}) {
  const [editedLabel, setEditedLabel] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  useEffect(() => {
    if (datum) {
      setEditedLabel(datum.label);
      setEditedDescription(datum.description ?? '');
    }
  }, [datum, isOpen]);

  if (!isOpen || !datum) {
    return null;
  }

  return (
    <div
      className="modal d-block"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: isOpen ? 'block' : 'none',
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
                value={editedLabel}
                onChange={(e) => setEditedLabel(e.target.value)}
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
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
              />
            </div>
            <p className="small text-muted mb-0">
              Class: {datum.class ?? '(none)'}
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onSave(datum.id, editedLabel, editedDescription)}
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
    activeAnnotationSelection,
    activeSocialLocks,
    focusedGeometryIds,
    focusedDataIds,
    focusData,
    clearFocus,
    isDataFocused,
    realtimeState,
    creating,
    updateData,
    markDataErasable,
    startEditorLock,
    stopEditorLock,
  } = useAnnotationStore();

  const [editingDatum, setEditingDatum] = useState<AnnotationData | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

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
        alert('Failed to delete annotation data');
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
        alert('Failed to delete selected data');
      }
    }
  };

  const handleEditSave = async (dataId: string, label: string, description: string) => {
    try {
      await updateData(dataId, { label, description });
      setIsEditModalOpen(false);
      setEditingDatum(null);
    } catch (err) {
      console.error('Failed to update annotation data:', err);
      alert('Failed to update annotation data');
    } finally {
      try {
        await stopEditorLock('data', dataId, 'editing annotation data');
      } catch (lockErr) {
        console.warn('Failed to release data editor lock:', lockErr);
      }
    }
  };

  const handleEditStart = async (datum: AnnotationData) => {
    setEditingDatum(datum);
    setIsEditModalOpen(true);
    try {
      await startEditorLock('data', datum.id, 'editing annotation data');
    } catch (lockErr) {
      console.warn('Failed to publish data editor lock:', lockErr);
    }
  };

  const handleEditCancel = async () => {
    const datumId = editingDatum?.id;
    setIsEditModalOpen(false);
    setEditingDatum(null);
    if (!datumId) {
      return;
    }
    try {
      await stopEditorLock('data', datumId, 'editing annotation data');
    } catch (lockErr) {
      console.warn('Failed to release data editor lock:', lockErr);
    }
  };

  useEffect(() => {
    return () => {
      if (editingDatum?.id) {
        void stopEditorLock('data', editingDatum.id, 'editing annotation data');
      }
    };
  }, [editingDatum, stopEditorLock]);

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

      <div className="mb-3 p-2 border rounded bg-light-subtle">
        <span className={`badge ${realtimeBadgeClass}`}>{realtimeLabel}</span>
        <p className="small text-muted mb-0 mt-2">
          Active data rows (query filter). Draw in the viewer to create geometry + data + link.
        </p>
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
              const linkedGeometryIds =
                activeAnnotationSelection.geometryIdsByDataId.get(datum.id) ?? [];
              const isUnderEditing = activeSocialLocks.some((lock) => {
                if (lock.lockKind !== 'editor') {
                  return false;
                }
                if (lock.resourceType === 'data') {
                  return lock.resourceId === datum.id;
                }
                if (lock.resourceType === 'geometry') {
                  return lock.resourceId != null && linkedGeometryIds.includes(lock.resourceId);
                }
                return false;
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
                          void handleEditStart(datum);
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
                  <p className="mb-0 small font-monospace" style={{ color: itemColors.text }}>
                    {datum.id}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EditDataModal
        datum={editingDatum}
        isOpen={isEditModalOpen}
        onSave={handleEditSave}
        onCancel={() => {
          void handleEditCancel();
        }}
      />
    </div>
  );
}
