import { useMemo } from 'react';
import { useAnnotationViewerController } from './useAnnotationViewerController';
import AnnotationPanelBase from './AnnotationPanelBase';
import AnnotationClassFilter from './AnnotationClassFilter';
import AnnotationLinkViewModeToggle from '../../components/AnnotationLinkViewModeToggle';

export default function AnnotationPanelViewer() {
  const {
    activeDataCount,
    activeGeometryCount,
    filteredActiveData,
    linkViewGeometries,
    dataEntries,
    focusedDataIds,
    focusedGeometryIds,
    selectData,
    clearFocus,
    sceneAnnotationClassPool,
    annotationClassFilterMode,
    annotationClassFilterValues,
    setAnnotationClassFilterValues,
    toggleAnnotationClassFilterValue,
    selectAllAnnotationClassFilters,
    clearAnnotationClassFilter,
    linkViewMode,
    setLinkViewMode,
    panelShowsFilteredData,
    viewerShowsFilteredGeometries,
  } = useAnnotationViewerController();

  const hasGeometrySelection = focusedGeometryIds.size > 0;
  const hasDataSelection = focusedDataIds.size > 0;

  const visibleData = filteredActiveData;

  return (
    <AnnotationPanelBase
      title="Annotations"
      subtitle="Read-only annotation data."
      headerRight={hasGeometrySelection ? (
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearFocus}>
          Clear selection
        </button>
      ) : null}
      status={(
        <div className="mb-3 p-2 border rounded bg-light-subtle small text-muted">
          {activeGeometryCount} active geometr{activeGeometryCount === 1 ? 'y' : 'ies'} and {activeDataCount} active data record{activeDataCount === 1 ? '' : 's'}.
        </div>
      )}
      classFilter={(
        <AnnotationClassFilter
          idPrefix="annotation-viewer"
          pool={sceneAnnotationClassPool}
          filterMode={annotationClassFilterMode}
          filterValues={annotationClassFilterValues}
          setFilterValues={setAnnotationClassFilterValues}
          toggleFilterValue={toggleAnnotationClassFilterValue}
          selectAllFilters={selectAllAnnotationClassFilters}
          clearFilter={clearAnnotationClassFilter}
        />
      )}
      toggle={(
        <AnnotationLinkViewModeToggle
          idPrefix="annotation-viewer"
          mode={linkViewMode}
          onChange={setLinkViewMode}
        />
      )}
    >
      <div className="d-flex flex-column gap-3">
        {visibleData.length > 0 ? (
          <section>
            <h5 className="h6 mb-2">Annotation data</h5>
            <div className="d-flex flex-column gap-2">
              {visibleData.map((data) => {
                const entry = dataEntries.find((e) => e.data.id === data.id);
                const linkedGeometries = entry?.linkedGeometries ?? [];
                const isSelected = focusedDataIds.has(data.id);
                return (
                  <div
                    key={data.id}
                    className={`border rounded p-2 ${isSelected ? 'border-primary bg-primary-subtle' : 'bg-white'}`}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      selectData(data.id, undefined, e.ctrlKey || e.metaKey);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectData(data.id, undefined, (e as any).ctrlKey || (e as any).metaKey);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                    aria-pressed={isSelected}
                    title="Select to highlight linked geometry"
                  >
                    <div className="fw-bold small mb-1">{data.label}</div>
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

        {panelShowsFilteredData && !hasGeometrySelection && !hasDataSelection ? (
          <div className="border rounded p-3 bg-white">
            <div className="fw-semibold mb-2">No selection</div>
            <div className="small text-muted">
              Select a geometry in the viewer or annotation data in the panel to filter linked items.
            </div>
          </div>
        ) : null}

        {panelShowsFilteredData && (hasGeometrySelection || hasDataSelection) && visibleData.length === 0 ? (
          <div className="border rounded p-3 bg-white">
            <div className="fw-semibold mb-2">No linked annotation data</div>
            <div className="small text-muted">
              The current selection is not linked to any annotation data matching the active filter.
            </div>
          </div>
        ) : null}

        {viewerShowsFilteredGeometries && (hasGeometrySelection || hasDataSelection) ? (
          <div className="border rounded p-3 bg-white">
            <div className="fw-semibold mb-2">Viewer filtered by data selection</div>
            <div className="small text-muted">
              Showing {linkViewGeometries.length} linked geometr{linkViewGeometries.length === 1 ? 'y' : 'ies'} in the viewer.
            </div>
          </div>
        ) : null}
      </div>
    </AnnotationPanelBase>
  );
}
