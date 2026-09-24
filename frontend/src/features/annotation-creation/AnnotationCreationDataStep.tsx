import { useMemo, useState } from 'react';
import type { AnnotationData } from 'shared/annotation-types';
import type { AnnotationCreationDraft } from './types';
import {
  allowsMultipleDataSelection,
  canAddMoreData,
  canCompleteDataStep,
  canSwitchToDataChoose,
  canUseDataChooseMode,
  geometryResultCount,
  isGeometryFirst,
} from './annotationCreationValidation';
import { orderByAnnotationDisplayNumber } from '../../utils/annotationDisplayNumbers';
import AnnotationIndexBadge from '../../shared/ui/AnnotationIndexBadge';

interface AnnotationCreationDataStepProps {
  draft: AnnotationCreationDraft;
  candidates: readonly AnnotationData[];
  /** Optional presentation-only numbers for a workbench candidate list. */
  displayNumbersById?: ReadonlyMap<string, number>;
  creating?: boolean;
  onToggleDataSelection: (dataId: string) => void;
  onOpenCreateModal: () => void;
  onDataModeChange: (mode: 'new' | 'choose') => void;
  onUndoLastCreatedData: () => void;
  onDone: () => void;
}

export default function AnnotationCreationDataStep({
  draft,
  candidates,
  displayNumbersById,
  creating = false,
  onToggleDataSelection,
  onOpenCreateModal,
  onDataModeChange,
  onUndoLastCreatedData,
  onDone,
}: AnnotationCreationDataStepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const allowsMultiple = allowsMultipleDataSelection(draft);
  const selectedIds = new Set(draft.selectedDataIds);
  const geometryCount = geometryResultCount(draft);
  const canChooseData = canUseDataChooseMode(draft) && canSwitchToDataChoose(draft);
  const canCreateMore = canAddMoreData(draft);
  const doneEnabled = canCompleteDataStep(draft).ok && !creating;
  const isFirst = !isGeometryFirst(draft);

  const filteredCandidates = useMemo(() => {
    const ordered = displayNumbersById
      ? orderByAnnotationDisplayNumber(candidates, displayNumbersById)
      : candidates;
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return ordered;
    }
    return ordered.filter((datum) => {
      const haystack = [
        datum.label,
        datum.description ?? '',
        datum.class ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [candidates, displayNumbersById, searchQuery]);

  const modeControls = (
    <div className="btn-group w-100" role="group" aria-label="Data source">
      <button
        type="button"
        className={`btn ${draft.dataMode === 'new' ? 'btn-primary' : 'btn-outline-primary'}`}
        aria-pressed={draft.dataMode === 'new'}
        disabled={creating || !canCreateMore}
        title={
          !canCreateMore
            ? 'Only one data record is allowed with multiple geometries'
            : undefined
        }
        onClick={() => {
          onDataModeChange('new');
          onOpenCreateModal();
        }}
      >
        <i className="bi bi-plus-lg me-2" aria-hidden />New
      </button>
      <button
        type="button"
        className={`btn ${draft.dataMode === 'choose' ? 'btn-primary' : 'btn-outline-primary'}`}
        aria-pressed={draft.dataMode === 'choose'}
        disabled={!canChooseData || creating}
        title={
          !canUseDataChooseMode(draft)
            ? 'Existing data needs a geometry to link to'
            : !canSwitchToDataChoose(draft)
              ? 'Clear created data before choosing existing'
              : undefined
        }
        onClick={() => onDataModeChange('choose')}
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
  );

  return (
    <div className="d-flex flex-column gap-3 h-100">
      <div>
        <h3 className="h6 mb-1">Data</h3>
        <p className="small text-muted mb-3">
          {isFirst
            ? 'Create or choose data first. Press Done with nothing selected to skip to geometry-only.'
            : geometryCount === 0
              ? 'Create one or more data records (geometry was skipped).'
              : draft.geometryMode === 'new'
                ? 'Optionally create or choose data to link, or Done to keep geometries only.'
                : 'Create or choose data to link to the selected geometries.'}
        </p>
        {modeControls}
      </div>

      {draft.dataMode === 'new' ? (
        <div className="d-flex flex-column gap-2 flex-grow-1">
          <div className="d-flex align-items-center justify-content-between gap-2">
            <div className="small fw-semibold mb-0">Created data</div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={creating || draft.createdData.length === 0}
              title="Discard the last created data"
              onClick={onUndoLastCreatedData}
            >
              <i className="bi bi-arrow-counterclockwise me-1" aria-hidden />Undo
            </button>
          </div>
          {draft.createdData.length === 0 ? (
            <p className="text-muted fst-italic mb-0 small">
              {canCreateMore
                ? 'Press New to add a data record.'
                : 'No further data can be added.'}
            </p>
          ) : (
            <div className="list-group">
              {draft.createdData.map((item, index) => (
                <div
                  key={`created-data-${index}-${item.label}`}
                  className="list-group-item"
                >
                  <div className="fw-semibold">{item.label}</div>
                  {item.description ? (
                    <div className="small text-muted">{item.description}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {canCreateMore ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary align-self-start"
              disabled={creating}
              onClick={onOpenCreateModal}
            >
              <i className="bi bi-plus-lg me-1" aria-hidden />
              Add another
            </button>
          ) : geometryCount > 1 ? (
            <p className="small text-muted mb-0">
              Multiple geometries allow at most one data record.
            </p>
          ) : null}
        </div>
      ) : null}

      {draft.dataMode === 'choose' ? (
        <div className="d-flex flex-column gap-2 flex-grow-1" style={{ minHeight: 0 }}>
          <p className="text-muted small mb-0">
            {allowsMultiple
              ? 'Select one or more annotation data records to link.'
              : 'Select one annotation data record to link.'}
          </p>
          <input
            type="search"
            className="form-control form-control-sm"
            placeholder="Search annotation data..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search annotation data"
          />
          {filteredCandidates.length === 0 ? (
            <p className="text-muted fst-italic mb-0">No annotation data matches the current scope and filter.</p>
          ) : (
            <div className="list-group flex-grow-1 overflow-auto">
              {filteredCandidates.map((datum) => {
                const isSelected = selectedIds.has(datum.id);
                const displayNumber = displayNumbersById?.get(datum.id);
                return (
                  <button
                    key={datum.id}
                    type="button"
                    className={`list-group-item list-group-item-action text-start ${isSelected ? 'active' : ''}`}
                    onClick={() => onToggleDataSelection(datum.id)}
                    aria-pressed={isSelected}
                  >
                    <div className="d-flex align-items-start gap-2">
                      {displayNumber !== undefined ? (
                        <span className="annotation-index-column">
                          <AnnotationIndexBadge kind="data" number={displayNumber} />
                        </span>
                      ) : null}
                      <div style={{ minWidth: 0 }}>
                        <div className="fw-semibold">{datum.label}</div>
                        {datum.description ? (
                          <div className={`small ${isSelected ? 'opacity-75' : 'text-muted'}`}>
                            {datum.description}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {draft.dataMode === null ? (
        <p className="text-muted small mb-0">
          {isFirst
            ? 'Press New or Choose, or Done to continue without data.'
            : geometryCount === 0
              ? 'Press New to create data, then Done.'
              : draft.geometryMode === 'new'
                ? 'Press Done to save geometries only, or New/Choose to add data.'
                : 'Press New or Choose, then Done when ready.'}
        </p>
      ) : null}
    </div>
  );
}
