/**
 * AnnotationPanel Component
 * Displays list of annotations with interactive features:
 * - Single/multi-selection (CTRL+click)
 * - Edit and delete operations
 * - Real-time synchronization with viewers and backend
 */

import React, { useState, useRef, useEffect } from 'react';
import type { ViewerAnnotation } from '../../../../shared/scene-types';
import { useAnnotations } from '../../context/AnnotationContext';

interface AnnotationPanelProps {
  /**
   * Callback when a viewer should highlight annotations
   * Called after selection changes
   */
  onSelectionChanged?: (selectedIds: string[]) => void;
}

/**
 * Modal for editing an annotation
 */
function EditAnnotationModal({
  annotation,
  isOpen,
  onSave,
  onCancel
}: {
  annotation: ViewerAnnotation | null;
  isOpen: boolean;
  onSave: (annotation: ViewerAnnotation) => void;
  onCancel: () => void;
}) {
  const [editedLabel, setEditedLabel] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  useEffect(() => {
    if (annotation) {
      setEditedLabel(annotation.label);
      // Optional description field
      setEditedDescription(annotation.description || '');
    }
  }, [annotation, isOpen]);

  if (!isOpen || !annotation) return null;

  const handleSave = () => {
    const updated: ViewerAnnotation = {
      ...annotation,
      label: editedLabel,
      description: editedDescription
    };
    onSave(updated);
  };

  return (
    <div
      className="modal d-block"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: isOpen ? 'block' : 'none'
      }}
      onClick={onCancel}
    >
      <div className="modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Edit Annotation</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onCancel}
              aria-label="Close"
            />
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
                onChange={e => setEditedLabel(e.target.value)}
                placeholder="Enter annotation label"
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
                onChange={e => setEditedDescription(e.target.value)}
                placeholder="Enter annotation description"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Type</label>
              <p className="text-muted small">
                {annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1)}
              </p>
            </div>
            <div className="mb-3">
              <label className="form-label">Geometry</label>
              <p className="text-muted small font-monospace" style={{ wordBreak: 'break-all' }}>
                {JSON.stringify(annotation.geometry)}
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Main AnnotationPanel component
 */
export default function AnnotationPanel({ onSelectionChanged }: AnnotationPanelProps) {
  const {
    annotations,
    selectedAnnotationIds,
    isLoading,
    realtimeState,
    lastRemoteMutation,
    deleteAnnotations,
    updateAnnotationData,
    selectAnnotation,
    clearSelection
  } = useAnnotations();

  const [editingAnnotation, setEditingAnnotation] = useState<ViewerAnnotation | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [expandedGeomIds, setExpandedGeomIds] = useState<Set<string>>(new Set());
  const annotationListRef = useRef<HTMLDivElement>(null);

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

  const toggleGeom = (id: string) => {
    setExpandedGeomIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Handle annotation item click with Ctrl/Cmd for multi-select
   */
  const handleAnnotationClick = (id: string, e: React.MouseEvent) => {
    const multiSelect = e.ctrlKey || e.metaKey;
    selectAnnotation(id, multiSelect);
  };

  /**
   * Notify parent (viewer) when selection changes
   */
  useEffect(() => {
    if (onSelectionChanged) {
      onSelectionChanged(selectedAnnotationIds);
    }
  }, [selectedAnnotationIds, onSelectionChanged]);

  /**
   * Handle delete operation with confirmation
   */
  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this annotation?')) {
      try {
        await deleteAnnotations([id]);
      } catch (err) {
        console.error('Failed to delete annotation:', err);
        alert('Failed to delete annotation');
      }
    }
  };

  /**
   * Handle bulk delete of selected annotations
   */
  const handleBulkDelete = async () => {
    if (selectedAnnotationIds.length === 0) {
      alert('No annotations selected');
      return;
    }

    const count = selectedAnnotationIds.length;
    if (window.confirm(`Delete ${count} annotation${count > 1 ? 's' : ''}?`)) {
      try {
        await deleteAnnotations(selectedAnnotationIds);
      } catch (err) {
        console.error('Failed to delete annotations:', err);
        alert('Failed to delete annotations');
      }
    }
  };

  /**
   * Handle edit modal save
   */
  const handleEditSave = async (annotation: ViewerAnnotation) => {
    try {
      await updateAnnotationData(annotation.id, {
        label: annotation.label,
        description: annotation.description
      });
      setIsEditModalOpen(false);
      setEditingAnnotation(null);
    } catch (err) {
      console.error('Failed to update annotation:', err);
      alert('Failed to update annotation');
    }
  };

  return (
    <div className="p-3 h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="h4 mb-0">Annotations</h4>
        {selectedAnnotationIds.length > 0 && (
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={handleBulkDelete}
              disabled={isLoading}
              title={`Delete ${selectedAnnotationIds.length} selected annotation${selectedAnnotationIds.length > 1 ? 's' : ''}`}
            >
              <i className="bi bi-trash me-1"></i>
              Delete ({selectedAnnotationIds.length})
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={clearSelection}
              title="Clear selection"
            >
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 p-2 border rounded bg-light-subtle">
        <div className="d-flex justify-content-between align-items-center gap-2">
          <span className={`badge ${realtimeBadgeClass}`}>{realtimeLabel}</span>
          {lastRemoteMutation && (
            <span className="small text-muted text-end">
              Last event: {lastRemoteMutation.mutation}
            </span>
          )}
        </div>
        {lastRemoteMutation && (
          <div className="small text-muted mt-1">
            Entity {lastRemoteMutation.entity.kind}:{' '}
            <span className="font-monospace">{lastRemoteMutation.entity.id}</span>
          </div>
        )}
      </div>

      {annotations.length === 0 ? (
        <div className="flex-grow-1 d-flex align-items-center justify-content-center">
          <p className="text-muted fst-italic">
            No annotations yet. Double-click on the model to add an annotation point.
          </p>
        </div>
      ) : (
        <div className="flex-grow-1 overflow-auto" ref={annotationListRef}>
          <div className="list-group">
            {annotations.map((annotation: ViewerAnnotation) => {
              const isSelected = selectedAnnotationIds.includes(annotation.id);
              return (
                <div
                  key={annotation.id}
                  className={`list-group-item list-group-item-action d-flex flex-column align-items-stretch ${isSelected ? 'bg-warning' : 'bg-light'
                    }`}
                  onClick={(e) => handleAnnotationClick(annotation.id, e)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Top row: title (truncated) and action buttons */}
                  <div className="d-flex justify-content-between align-items-center w-100">
                    <div className="flex-grow-1" style={{ minWidth: 0, overflow: 'hidden' }}>
                      <h5
                        className="mb-1"
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {annotation.label}
                      </h5>
                    </div>

                    <div className="ms-2 d-flex gap-1 align-items-center flex-shrink-0">
                      <span
                        className={`badge ${annotation.type === 'point'
                          ? 'bg-danger'
                          : annotation.type === 'line'
                            ? 'bg-success'
                            : 'bg-primary'
                          }`}
                      >
                        {annotation.type}
                      </span>

                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAnnotation(annotation);
                          setIsEditModalOpen(true);
                        }}
                        disabled={isLoading}
                        title="Edit annotation"
                      >
                        <i className="bi bi-pencil"></i>
                      </button>

                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(annotation.id);
                        }}
                        disabled={isLoading}
                        title="Delete annotation"
                      >
                        <i className="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>

                  {/* Second row: full-width details */}
                  <div className="mt-2 w-100">
                    <p className="mb-1 small text-muted">ID: {annotation.id}</p>
                    <p className="mb-1 small text-muted">Description: {annotation.description}</p>
                    <p className="mb-0 small font-monospace" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Created by: {annotation.createdBy}
                    </p>
                    <p className="mb-0 small font-monospace" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Type: {annotation.type}
                    </p>
                    {annotation.type === 'point' &&
                      Array.isArray(annotation.geometry) &&
                      annotation.geometry.length === 3 && (
                        <p className="mb-0 small font-monospace" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          [{annotation.geometry[0].toFixed(1)}, {annotation.geometry[1].toFixed(1)}, {annotation.geometry[2].toFixed(1)}]
                        </p>
                      )}

                    {annotation.type !== 'point' &&
                      Array.isArray(annotation.geometry) && (
                        <div className="mt-2">
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            type="button"
                            aria-expanded={expandedGeomIds.has(annotation.id)}
                            onClick={(e) => { e.stopPropagation(); toggleGeom(annotation.id); }}
                          >
                            {expandedGeomIds.has(annotation.id) ? 'Hide Geometry' : 'Show Geometry'}
                          </button>
                          {expandedGeomIds.has(annotation.id) && (
                            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                              <p className="mb-1 small">
                                {(annotation.geometry as [number, number, number][]).length} points
                              </p>
                              <p className="mb-0 small font-monospace" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                [
                                {(annotation.geometry as [number, number, number][]).map((point, i) => (
                                  <span key={i}>
                                    {point[0].toFixed(1)}, {point[1].toFixed(1)}, {point[2].toFixed(1)}
                                    {i < (annotation.geometry as [number, number, number][]).length - 1 && (
                                      <>
                                        ],
                                        <br />
                                        [
                                      </>
                                    )}
                                  </span>
                                ))}
                                ]
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EditAnnotationModal
        annotation={editingAnnotation}
        isOpen={isEditModalOpen}
        onSave={handleEditSave}
        onCancel={() => {
          setIsEditModalOpen(false);
          setEditingAnnotation(null);
        }}
      />
    </div>
  );
}
