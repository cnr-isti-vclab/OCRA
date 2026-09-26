import { useMemo, useState } from 'react';
import '../../shared/ui/annotationEntityColors.css';
import { getVocabularyNodeLabel } from '../../utils/vocabulary';
import { getAnnotationGeometryTypeLabel } from '../../utils/annotationGeometryTypeLabel';
import AnnotationIndexBadge from '../../shared/ui/AnnotationIndexBadge';
import AnnotationPanelBase from '../../routes/components/AnnotationPanelBase';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { filterErasableData } from './filterErasableData';
import { useAnnotationTrash } from './AnnotationTrashContext';

/** Lists and restores soft-deleted annotation endpoints. */
export default function AnnotationTrashPanel() {
  const { vocabularyConcepts } = useAnnotationStore();
  const {
    erasableGeometries,
    erasableData,
    selectedGeometryIds,
    selectedDataIds,
    closeTrash,
    selectGeometry,
    selectData,
    clearGeometrySelection,
    clearDataSelection,
    restoreSelection,
  } = useAnnotationTrash();
  const [query, setQuery] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const geometryNumbers = useMemo(
    () => new Map(erasableGeometries.map((geometry, index) => [geometry.id, index + 1])),
    [erasableGeometries],
  );
  const dataNumbers = useMemo(
    () => new Map(erasableData.map((datum, index) => [datum.id, index + 1])),
    [erasableData],
  );
  const classLabels = useMemo(
    () => new Map(vocabularyConcepts.map((concept) => [concept.curie, getVocabularyNodeLabel(concept)])),
    [vocabularyConcepts],
  );
  const filteredData = useMemo(
    () => filterErasableData(erasableData, query, classLabels),
    [classLabels, erasableData, query],
  );
  const selectionCount = selectedGeometryIds.size + selectedDataIds.size;

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      await restoreSelection();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not restore the selected annotations.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <AnnotationPanelBase
      title="Trash"
      contentClassName="overflow-hidden"
      subtitle="Select erased geometry in this list or in the viewer."
      headerRight={(
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={closeTrash} aria-label="Close trash" title="Close">
          <i className="bi bi-x-lg" aria-hidden />
        </button>
      )}
    >
      <div className="d-flex flex-column gap-3 h-100">
        <section className="d-flex flex-column flex-fill" style={{ minHeight: 0 }}>
          <h5 className="h6 text-primary">Geometry</h5>
          <div className="list-group annotation-trash-list overflow-auto flex-grow-1" style={{ minHeight: 0 }} tabIndex={0} aria-label="Erased geometry"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                clearGeometrySelection();
              }
            }}>
            {erasableGeometries.length === 0 ? <p className="text-muted small mb-0">No erased geometry.</p> : erasableGeometries.map((geometry) => (
              <button key={geometry.id} type="button" aria-pressed={selectedGeometryIds.has(geometry.id)}
                className={'list-group-item list-group-item-action text-start d-flex align-items-center ' + (selectedGeometryIds.has(geometry.id) ? 'active' : 'list-group-item-info')}
                onClick={(event) => selectGeometry(geometry.id, event.ctrlKey || event.metaKey)}>
                <AnnotationIndexBadge kind="geometry" number={geometryNumbers.get(geometry.id) ?? 0} />
                <span className="ms-2">Geometry: {getAnnotationGeometryTypeLabel(geometry)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="annotation-data-accent d-flex flex-column flex-fill" style={{ minHeight: 0 }}>
          <h5 className="h6">Data</h5>
          <label className="visually-hidden" htmlFor="annotation-trash-search">Search erased data</label>
          <div className="input-group input-group-sm mb-2">
            <span className="input-group-text"><i className="bi bi-search" aria-hidden /></span>
            <input id="annotation-trash-search" type="search" className="form-control" value={query}
              onChange={(event) => setQuery(event.target.value)} placeholder="Search labels and classes" />
          </div>
          <div className="list-group annotation-trash-list overflow-auto flex-grow-1" style={{ minHeight: 0 }} tabIndex={0} aria-label="Erased data"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                clearDataSelection();
              }
            }}>
            {filteredData.length === 0 ? <p className="text-muted small mb-0">No erased data matches the search.</p> : filteredData.map((datum) => (
              <button key={datum.id} type="button" aria-pressed={selectedDataIds.has(datum.id)}
                className={'list-group-item list-group-item-action text-start ' + (selectedDataIds.has(datum.id) ? 'active' : '')}
                onClick={(event) => selectData(datum.id, event.ctrlKey || event.metaKey)}>
                <span className="d-flex align-items-center">
                  <AnnotationIndexBadge kind="data" number={dataNumbers.get(datum.id) ?? 0} />
                  <span className="ms-2">{datum.label}</span>
                </span>
                <span className="d-block small opacity-75 mt-1">{datum.class ? classLabels.get(datum.class) ?? datum.class : 'Unclassified'}</span>
              </button>
            ))}
          </div>
        </section>

        {error ? <p className="alert alert-danger py-2 mb-0" role="alert">{error}</p> : null}
        <div className="d-flex justify-content-between gap-2 mt-auto pt-2 border-top">
          <button type="button" className="btn btn-outline-secondary" onClick={closeTrash} disabled={restoring}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void handleRestore()} disabled={restoring || selectionCount === 0}>
            <i className="bi bi-arrow-counterclockwise me-1" aria-hidden />
            {restoring ? 'Restoring…' : 'Restore' + (selectionCount > 0 ? ' (' + selectionCount + ')' : '')}
          </button>
        </div>
      </div>
    </AnnotationPanelBase>
  );
}
