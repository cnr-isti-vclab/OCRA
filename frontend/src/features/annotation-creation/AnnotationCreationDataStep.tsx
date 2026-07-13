import { useMemo, useState } from 'react';
import type { AnnotationData } from 'shared/annotation-types';
import type { AnnotationCreationDraft } from './types';
import { allowsMultipleDataSelection } from './annotationCreationValidation';

interface AnnotationCreationDataStepProps {
  draft: AnnotationCreationDraft;
  candidates: readonly AnnotationData[];
  onToggleDataSelection: (dataId: string) => void;
  onOpenCreateModal: () => void;
}

export default function AnnotationCreationDataStep({
  draft,
  candidates,
  onToggleDataSelection,
  onOpenCreateModal,
}: AnnotationCreationDataStepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const allowsMultiple = allowsMultipleDataSelection(draft);
  const selectedIds = new Set(draft.selectedDataIds);

  const filteredCandidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return candidates;
    }
    return candidates.filter((datum) => {
      const haystack = [
        datum.label,
        datum.description ?? '',
        datum.class ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [candidates, searchQuery]);

  if (draft.dataChoice === 'new') {
    const hasDraft = draft.newDataLabel.trim().length > 0;
    return (
      <div className="d-flex flex-column gap-3 h-100">
        <p className="text-muted small mb-0">
          Create a new annotation data record, then confirm to link it with the selected geometry.
        </p>
        {hasDraft ? (
          <div className="list-group">
            <div className="list-group-item list-group-item-action active">
              <div className="fw-semibold">{draft.newDataLabel}</div>
              {draft.newDataDescription ? (
                <div className="small opacity-75">{draft.newDataDescription}</div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-muted fst-italic mb-0">No annotation data drafted yet.</p>
        )}
        <button type="button" className="btn btn-outline-primary btn-sm align-self-start" onClick={onOpenCreateModal}>
          {hasDraft ? 'Edit annotation data' : 'Create annotation data'}
        </button>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column gap-2 h-100">
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
            return (
              <button
                key={datum.id}
                type="button"
                className={`list-group-item list-group-item-action text-start ${isSelected ? 'active' : ''}`}
                onClick={() => onToggleDataSelection(datum.id)}
                aria-pressed={isSelected}
              >
                <div className="fw-semibold">{datum.label}</div>
                {datum.description ? (
                  <div className={`small ${isSelected ? 'opacity-75' : 'text-muted'}`}>
                    {datum.description}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
