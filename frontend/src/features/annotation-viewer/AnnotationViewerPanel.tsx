import { useEffect, useMemo, useState } from 'react';
import { useAnnotationViewerController } from './useAnnotationViewerController';

function AnnotationClassFilter() {
  const {
    sceneAnnotationClassPool,
    annotationClassFilterMode,
    annotationClassFilterValues,
    setAnnotationClassFilterValues,
    toggleAnnotationClassFilterValue,
    selectAllAnnotationClassFilters,
    clearAnnotationClassFilter,
  } = useAnnotationViewerController();
  const [classPoolExpanded, setClassPoolExpanded] = useState(false);
  const [classPoolSearch, setClassPoolSearch] = useState('');
  const [manualClassFilterInput, setManualClassFilterInput] = useState('');

  useEffect(() => {
    setManualClassFilterInput(annotationClassFilterValues.join(', '));
  }, [annotationClassFilterValues]);

  const visibleClassPool = useMemo(() => {
    const needle = classPoolSearch.trim().toLowerCase();
    if (!needle) {
      return sceneAnnotationClassPool;
    }
    return sceneAnnotationClassPool.filter((option) =>
      option.curie.toLowerCase().includes(needle) || option.label.toLowerCase().includes(needle),
    );
  }, [classPoolSearch, sceneAnnotationClassPool]);

  const commitManualClassFilterInput = () => {
    const values = manualClassFilterInput
      .split(/[,\n]+/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    setAnnotationClassFilterValues(values);
  };

  return (
    <div className="mb-3 d-flex flex-column gap-2">
      <div className="d-flex justify-content-between align-items-center gap-2">
        <label htmlFor="annotation-viewer-class-filter-input" className="form-label small fw-semibold mb-0">
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
            aria-controls="annotation-viewer-class-chip-pool"
          >
            {classPoolExpanded ? 'Hide classes' : 'Show classes'}
          </button>
        </div>
      </div>
      <input
        id="annotation-viewer-class-filter-input"
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
          id="annotation-viewer-class-chip-pool"
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
  );
}

export default function AnnotationViewerPanel() {
  const {
    activeDataCount,
    activeGeometryCount,
    filteredActiveData,
    dataEntries,
    focusedGeometryIds,
    clearFocus,
  } = useAnnotationViewerController();

  const hasGeometrySelection = focusedGeometryIds.size > 0;
  const [onlySelectedGeometryData, setOnlySelectedGeometryData] = useState(false);

  const visibleData = useMemo(
    () => (onlySelectedGeometryData ? dataEntries.map((e) => e.data) : filteredActiveData),
    [onlySelectedGeometryData, dataEntries, filteredActiveData],
  );

  return (
    <div className="p-3 h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="h4 mb-0">Annotations</h4>
          <div className="text-muted small">Read-only annotation data.</div>
        </div>
        {hasGeometrySelection ? (
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearFocus}>
            Clear selection
          </button>
        ) : null}
      </div>

      <div className="mb-3 p-2 border rounded bg-light-subtle small text-muted">
        {activeGeometryCount} active geometr{activeGeometryCount === 1 ? 'y' : 'ies'} and {activeDataCount} active data record{activeDataCount === 1 ? '' : 's'}.
      </div>

      <AnnotationClassFilter />

      <div className="mb-3 form-check">
        <input
          className="form-check-input"
          type="checkbox"
          id="annotation-viewer-only-selected-geometry-data"
          checked={onlySelectedGeometryData}
          onChange={(e) => setOnlySelectedGeometryData(e.target.checked)}
        />
        <label className="form-check-label small" htmlFor="annotation-viewer-only-selected-geometry-data">
          Show only data linked to selected geometries
        </label>
      </div>

      <div className="flex-grow-1 overflow-auto d-flex flex-column gap-3">
        {visibleData.length > 0 ? (
          <section>
            <h5 className="h6 mb-2">Annotation data</h5>
            <div className="d-flex flex-column gap-2">
              {visibleData.map((data) => {
                const entry = dataEntries.find((e) => e.data.id === data.id);
                const linkedGeometries = entry?.linkedGeometries ?? [];
                return (
                <div key={data.id} className="border rounded p-2 bg-white">
                  <div className="fw-semibold">{data.label}</div>
                  {data.class ? (
                    <div className="small text-muted mb-2">{data.class}</div>
                  ) : null}
                  {data.description ? (
                    <div className="small mb-2" style={{ whiteSpace: 'pre-wrap' }}>
                      {data.description}
                    </div>
                  ) : (
                    <div className="small text-muted mb-2">No description.</div>
                  )}
                  {linkedGeometries.length > 1 ? (
                    <>
                      <div className="small text-muted mb-1">Also linked to</div>
                      <div className="small text-muted">
                        {linkedGeometries.map((geometry) => geometry.id).join(', ')}
                      </div>
                    </>
                  ) : null}
                </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {onlySelectedGeometryData && !hasGeometrySelection ? (
          <div className="border rounded p-3 bg-white">
            <div className="fw-semibold mb-2">No geometry selected</div>
            <div className="small text-muted">
              Select an annotation geometry in the viewer to inspect its linked annotation data here.
            </div>
          </div>
        ) : null}

        {onlySelectedGeometryData && hasGeometrySelection && dataEntries.length === 0 ? (
          <div className="border rounded p-3 bg-white">
            <div className="fw-semibold mb-2">No linked annotation data</div>
            <div className="small text-muted">
              The selected geometry is not currently linked to any annotation data matching the active filter.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
