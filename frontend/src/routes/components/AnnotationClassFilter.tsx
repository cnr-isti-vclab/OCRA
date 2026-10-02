import { useMemo, useState } from 'react';
import type {
  AnnotationClassFilterMode,
  SceneAnnotationClassOption,
} from '../../context/AnnotationStoreContext';
import { isUnclassifiedClassFilter } from '../../stores/annotation-class-filter';

export default function AnnotationClassFilter({
  idPrefix,
  pool,
  filterMode,
  filterValues,
  toggleFilterValue,
  selectAllFilters,
  clearFilter,
}: {
  idPrefix: string;
  pool: readonly SceneAnnotationClassOption[];
  filterMode: AnnotationClassFilterMode;
  filterValues: readonly string[];
  toggleFilterValue: (value: string) => void;
  selectAllFilters: () => void;
  clearFilter: () => void;
}) {
  const [classPoolExpanded, setClassPoolExpanded] = useState(false);
  const [classPoolSearch, setClassPoolSearch] = useState('');
  const visibleClassPool = useMemo(() => {
    const needle = classPoolSearch.trim().toLowerCase();
    if (!needle) {
      return pool;
    }
    return pool.filter((option) =>
      option.curie.toLowerCase().includes(needle) || option.label.toLowerCase().includes(needle),
    );
  }, [classPoolSearch, pool]);

  const poolId = `${idPrefix}-annotation-class-chip-pool`;

  return (
    <div className="mb-3 d-flex flex-column gap-2">
      <div className="d-flex justify-content-between align-items-center gap-2">
        <span className="form-label small fw-semibold mb-0">
          Class filter
        </span>
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

      {classPoolExpanded && (
        <div
          id={poolId}
          className="border rounded p-2 bg-light-subtle d-flex flex-column gap-2 overflow-auto"
          style={{ maxHeight: '18rem' }}
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
