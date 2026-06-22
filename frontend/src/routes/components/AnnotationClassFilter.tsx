import { useEffect, useMemo, useState } from 'react';
import type {
  AnnotationClassFilterMode,
  SceneAnnotationClassOption,
} from '../../context/AnnotationStoreContext';
import {
  UNCLASSIFIED_ANNOTATION_CLASS,
  isUnclassifiedClassFilter,
} from '../../stores/annotation-class-filter';

export default function AnnotationClassFilter({
  idPrefix,
  pool,
  filterMode,
  filterValues,
  setFilterValues,
  toggleFilterValue,
  selectAllFilters,
  clearFilter,
}: {
  idPrefix: string;
  pool: readonly SceneAnnotationClassOption[];
  filterMode: AnnotationClassFilterMode;
  filterValues: readonly string[];
  setFilterValues: (values: string[]) => void;
  toggleFilterValue: (value: string) => void;
  selectAllFilters: () => void;
  clearFilter: () => void;
}) {
  const [classPoolExpanded, setClassPoolExpanded] = useState(false);
  const [classPoolSearch, setClassPoolSearch] = useState('');
  const [manualClassFilterInput, setManualClassFilterInput] = useState('');

  useEffect(() => {
    setManualClassFilterInput(
      filterValues
        .map((curie) => (isUnclassifiedClassFilter(curie) ? 'Unclassified' : curie))
        .join(', '),
    );
  }, [filterValues]);

  const visibleClassPool = useMemo(() => {
    const needle = classPoolSearch.trim().toLowerCase();
    if (!needle) {
      return pool;
    }
    return pool.filter((option) =>
      option.curie.toLowerCase().includes(needle) || option.label.toLowerCase().includes(needle),
    );
  }, [classPoolSearch, pool]);

  const commitManualClassFilterInput = () => {
    const values = manualClassFilterInput
      .split(/[,\n]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) =>
        value.toLowerCase() === 'unclassified' ? UNCLASSIFIED_ANNOTATION_CLASS : value,
      );
    setFilterValues(values);
  };

  const inputId = `${idPrefix}-annotation-class-filter-input`;
  const poolId = `${idPrefix}-annotation-class-chip-pool`;

  return (
    <div className="mb-3 d-flex flex-column gap-2">
      <div className="d-flex justify-content-between align-items-center gap-2">
        <label htmlFor={inputId} className="form-label small fw-semibold mb-0">
          Class filter
        </label>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm py-0 px-2"
            onClick={clearFilter}
            disabled={filterMode === 'none' && filterValues.length === 0}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm py-0 px-2"
            onClick={() => setClassPoolExpanded((current) => !current)}
            aria-expanded={classPoolExpanded}
            aria-controls={poolId}
          >
            {classPoolExpanded ? 'Hide classes' : 'Show classes'}
          </button>
        </div>
      </div>

      <input
        id={inputId}
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
        <div id={poolId} className="border rounded p-2 bg-light-subtle d-flex flex-column gap-2">
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
              className={`btn btn-sm ${filterMode === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={selectAllFilters}
              disabled={pool.length === 0}
            >
              ALL
            </button>
            {visibleClassPool.map((option) => {
              const selected = filterValues.includes(option.curie);
              return (
                <button
                  key={option.curie}
                  type="button"
                  className={`btn btn-sm ${selected ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => toggleFilterValue(option.curie)}
                  title={isUnclassifiedClassFilter(option.curie) ? option.label : option.curie}
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

      {pool.length === 0 && (
        <div className="text-muted small">No annotation data in this scene.</div>
      )}
    </div>
  );
}
