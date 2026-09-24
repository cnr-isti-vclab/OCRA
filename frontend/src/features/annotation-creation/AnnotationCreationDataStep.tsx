import { useMemo, useState } from 'react';
import type { AnnotationData } from 'shared/annotation-types';
import type { AnnotationCreationDraft } from './types';
import {
  allowsMultipleDataSelection,
  canUseDataChooseMode,
  geometryResultCount,
} from './annotationCreationValidation';
import { orderByAnnotationDisplayNumber } from '../../utils/annotationDisplayNumbers';
import AnnotationIndexBadge from '../../shared/ui/AnnotationIndexBadge';

interface AnnotationCreationDataStepProps {
  draft: AnnotationCreationDraft;
  candidates: readonly AnnotationData[];
  /** Optional presentation-only numbers for a workbench candidate list. */
  displayNumbersById?: ReadonlyMap<string, number>;
  onToggleDataSelection: (dataId: string) => void;
  onOpenCreateModal: () => void;
  onDataChoiceChange: (choice: 'new' | 'choose') => void;
}

export default function AnnotationCreationDataStep({
  draft,
  candidates,
  displayNumbersById,
  onToggleDataSelection,
  onOpenCreateModal,
  onDataChoiceChange,
}: AnnotationCreationDataStepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const allowsMultiple = allowsMultipleDataSelection(draft);
  const selectedIds = new Set(draft.selectedDataIds);
  const geometryCount = geometryResultCount(draft);
  const canChooseData = canUseDataChooseMode(draft);

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

  const choiceControls = (
    <div className="btn-group w-100" role="group" aria-label="Data source">
      <button
        type="button"
        className={`btn ${draft.dataMode === 'new' ? 'btn-primary' : 'btn-outline-primary'}`}
        aria-pressed={draft.dataMode === 'new'}
        onClick={() => {
          onDataChoiceChange('new');
          onOpenCreateModal();
        }}
      >
        <i className="bi bi-plus-lg me-2" aria-hidden />Create new
      </button>
      <button
        type="button"
        className={`btn ${draft.dataMode === 'choose' ? 'btn-primary' : 'btn-outline-primary'}`}
        aria-pressed={draft.dataMode === 'choose'}
        disabled={!canChooseData}
        title={!canChooseData ? 'Existing data needs a geometry to link to' : undefined}
        onClick={() => onDataChoiceChange('choose')}
      >
        <i className="bi bi-list-check me-2" aria-hidden />Choose existing
      </button>
    </div>
  );

  if (draft.dataMode === null) {
    return (
      <div className="d-flex flex-column gap-3">
        {choiceControls}
        <p className="text-muted small mb-0">
          {geometryCount === 0
            ? 'Create a new data record to continue, or go back to add geometry.'
            : draft.geometryMode === 'new'
              ? 'No data will be created or linked. Confirm to keep the geometry only.'
              : 'Create new data or choose existing data to link to the selected geometry.'}
        </p>
      </div>
    );
  }

  if (draft.dataMode === 'new') {
    const hasDraft = draft.pendingDataLabel.trim().length > 0;
    return (
      <div className="d-flex flex-column gap-3 h-100">
        {choiceControls}
        <p className="text-muted small mb-0">
          {geometryCount === 0
            ? 'Create a standalone data record. Existing data cannot be chosen without a geometry to link it to.'
            : 'Create a new annotation data record, then confirm to link it with the selected geometry.'}
        </p>
        {hasDraft ? (
          <div className="list-group">
            <div className="list-group-item list-group-item-action active">
              <div className="fw-semibold">{draft.pendingDataLabel}</div>
              {draft.pendingDataDescription ? (
                <div className="small opacity-75">{draft.pendingDataDescription}</div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-muted fst-italic mb-0">No annotation data drafted yet.</p>
        )}
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-2 h-100">
      {choiceControls}
      <p className="text-muted small mb-0">
        {allowsMultiple
          ? 'Select one or more annotation data records to link. Click a row to toggle selection.'
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
  );
}
