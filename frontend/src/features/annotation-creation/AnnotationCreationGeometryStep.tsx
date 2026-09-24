import type { AnnotationCreationDraft, AnnotationDrawingMode } from './types';
import {
  canAddMoreGeometry,
  canCompleteGeometryStep,
  canSwitchToGeometryChoose,
  canUseGeometryChooseMode,
  dataResultCount,
  isGeometryFirst,
} from './annotationCreationValidation';
import AnnotationToolbar from '../../components/AnnotationToolbar';

interface AnnotationCreationGeometryStepProps {
  draft: AnnotationCreationDraft;
  creating?: boolean;
  /** Hide the shape toolbar (e.g. when the host already shows one). */
  showToolbar?: boolean;
  onGeometryModeChange: (mode: 'new' | 'choose') => void;
  onDrawingModeChange?: (mode: AnnotationDrawingMode) => void;
  onUndoLastCreatedGeometry: () => void;
  onDone: () => void;
}

export default function AnnotationCreationGeometryStep({
  draft,
  creating = false,
  showToolbar = true,
  onGeometryModeChange,
  onDrawingModeChange,
  onUndoLastCreatedGeometry,
  onDone,
}: AnnotationCreationGeometryStepProps) {
  const dataCount = dataResultCount(draft);
  const canChoose = canUseGeometryChooseMode(draft) && canSwitchToGeometryChoose(draft);
  const canCreateMore = canAddMoreGeometry(draft);
  const doneEnabled = canCompleteGeometryStep(draft).ok && !creating;
  const isFirst = isGeometryFirst(draft);

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <h3 className="h6 mb-1">Geometry</h3>
        <p className="small text-muted mb-3">
          {isFirst
            ? 'Draw a new geometry or choose one already available. Press Done with nothing selected to skip to data-only.'
            : dataCount === 0
              ? 'Create one or more geometries (data was skipped).'
              : draft.dataMode === 'new'
                ? 'Optionally create or choose geometry to link, or Done to keep data only.'
                : 'Create or choose geometry to link to the selected data.'}
        </p>
        <div className="btn-group w-100" role="group" aria-label="Geometry source">
          <button
            type="button"
            className={`btn ${draft.geometryMode === 'new' ? 'btn-primary' : 'btn-outline-primary'}`}
            aria-pressed={draft.geometryMode === 'new'}
            disabled={creating || !canCreateMore}
            title={
              !canCreateMore
                ? 'Only one geometry is allowed with multiple data records'
                : undefined
            }
            onClick={() => onGeometryModeChange('new')}
          >
            <i className="bi bi-pencil me-2" aria-hidden />New
          </button>
          <button
            type="button"
            className={`btn ${draft.geometryMode === 'choose' ? 'btn-primary' : 'btn-outline-primary'}`}
            aria-pressed={draft.geometryMode === 'choose'}
            disabled={!canChoose || creating}
            title={
              !canUseGeometryChooseMode(draft)
                ? 'Existing geometry needs data to link to'
                : !canSwitchToGeometryChoose(draft)
                  ? 'Clear created geometries before choosing existing'
                  : undefined
            }
            onClick={() => onGeometryModeChange('choose')}
          >
            <i className="bi bi-list-check me-2" aria-hidden />Choose
          </button>
          <button
            type="button"
            className="btn btn-outline-primary"
            disabled={!doneEnabled}
            onClick={onDone}
          >
            <i className="bi bi-check-lg me-2" aria-hidden />Done
          </button>
        </div>
      </div>

      {draft.geometryMode === 'new' ? (
        <div className="border rounded p-2 bg-light-subtle" aria-label="Geometry drawing tool">
          <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
            <div className="small fw-semibold mb-0">Shape</div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={creating || draft.createdGeometries.length === 0}
              title="Discard the last created geometry"
              onClick={onUndoLastCreatedGeometry}
            >
              <i className="bi bi-arrow-counterclockwise me-1" aria-hidden />Undo
            </button>
          </div>
          {showToolbar && onDrawingModeChange ? (
            <AnnotationToolbar
              mode={draft.drawingMode}
              onModeChange={(drawingMode) => {
                if (drawingMode !== 'edit') {
                  onDrawingModeChange(drawingMode);
                }
              }}
              hiddenModes={['edit']}
            />
          ) : null}
          {draft.createdGeometries.length > 0 ? (
            <p className="small text-muted mb-0 mt-2" aria-live="polite">
              {draft.createdGeometries.length}
              {' '}
              geometr
              {draft.createdGeometries.length === 1 ? 'y' : 'ies'}
              {' '}
              drafted — keep drawing or press Done.
            </p>
          ) : (
            <p className="small text-muted mb-0 mt-2">
              Draw in the viewer. Each completed shape is kept; stay in draw mode for the next one.
            </p>
          )}
          {!canCreateMore && dataCount > 1 ? (
            <p className="small text-muted mb-0 mt-2">
              Multiple data records allow at most one geometry.
            </p>
          ) : null}
        </div>
      ) : null}

      {draft.geometryMode === 'choose' ? (
        <p className="small text-muted mb-0">
          Select
          {' '}
          {dataCount > 1 ? 'one geometry' : 'one or more geometries'}
          {' '}
          in the viewer
          {draft.selectedGeometryIds.length > 0
            ? ` (${draft.selectedGeometryIds.length} selected)`
            : ''}
          .
        </p>
      ) : null}

      {draft.geometryMode === null ? (
        <p className="small text-muted mb-0">
          {dataCount === 0 && !isFirst
            ? 'Press New to create geometry, then Done.'
            : isFirst
              ? 'Press New or Choose, or Done to continue without geometry.'
              : 'Press Done to save data only, or New/Choose to add geometry.'}
        </p>
      ) : null}
    </div>
  );
}
