import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnnotationLink } from 'shared/annotation-types';
import { annotationListSelection } from '../../utils/annotationListSelection';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import { commonAnnotationCounterparts, annotationOperationLinks } from '../../utils/annotationUnlinkSelection';
import { buildAnnotationDisplayNumbers } from '../../utils/annotationDisplayNumbers';
import AnnotationIndexBadge from '../../shared/ui/AnnotationIndexBadge';
import { isEntityBlockedForDeletion } from './isEntityBlockedForDeletion';
import type { AnnotationDeletionDraft, AnnotationDeletionIntent } from './types';

interface AnnotationDeletionPanelProps {
  draft: AnnotationDeletionDraft;
  setupError: string | null;
  onStartDelete: (intent: AnnotationDeletionIntent) => void;
  onBack: () => void;
  onConfirmDelete: () => void;
  confirming?: boolean;
}

/** Select endpoints, review unlink or erase, then return to Annotations. */
export default function AnnotationDeletionPanel({ draft, setupError, onStartDelete, onBack, onConfirmDelete, confirming = false }: AnnotationDeletionPanelProps) {
  const { allData, allGeometries, updateDeletionDraft, loadProjectLinksForDeletion, loadProjectData,
    addGeometryToDeletionBasket, addDataToDeletionBasket, deselectGeometryFromDeletionBasket,
    deselectDataFromDeletionBasket, activeSocialLocks, currentStreamId, allLinks, activeAnnotationSelection } = useAnnotationStore();
  const [projectLinks, setProjectLinks] = useState<AnnotationLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [loading, setLoading] = useState(false);
  const kind = draft.targetKind ?? (draft.deleteGeometry ? 'geometry' : 'data');
  const ids = draft.selectedEndpointIds ?? [];
  const selected = new Set(ids);
  const counterparts = draft.selectedCounterpartIds ?? [];
  const operation = draft.operation ?? 'unlink';
  const selectionKey = ids.join('|');
  const reviewSelection = useRef('');
  reviewSelection.current = kind + ':' + selectionKey;
  useEffect(() => () => { reviewSelection.current = ''; }, []);
  const geometryNumbers = useMemo(() => buildAnnotationDisplayNumbers(allGeometries), [allGeometries]);
  const dataNumbers = useMemo(() => buildAnnotationDisplayNumbers(allData), [allData]);

  useEffect(() => {
    setReviewing(false);
    setProjectLinks(null);
    setError(null);
  }, [selectionKey, kind]);

  const common = projectLinks ? commonAnnotationCounterparts(projectLinks, kind, ids) : [];
  const affected = projectLinks ? annotationOperationLinks(projectLinks, kind, ids,
    operation === 'unlink' ? counterparts : undefined) : [];

  const review = async () => {
    const reviewingSelection = reviewSelection.current;
    setLoading(true);
    setError(null);
    try {
      const [links] = await Promise.all([loadProjectLinksForDeletion(), loadProjectData()]);
      if (reviewSelection.current !== reviewingSelection) return;
      setProjectLinks(links);
      updateDeletionDraft({ selectedCounterpartIds: [] });
      setReviewing(true);
    } catch { setError('Could not load all project relationships. Please try again.'); }
    finally { setLoading(false); }
  };

  const blocked = (id: string) => isEntityBlockedForDeletion({ entityKind: kind, entityId: id,
    activeSocialLocks, currentStreamId, links: projectLinks ?? allLinks,
    geometryIdsByDataId: activeAnnotationSelection.geometryIdsByDataId });
  const toggleEndpoint = (id: string, additive: boolean) => {
    const next = annotationListSelection(ids, id, additive);
    for (const previousId of ids) {
      if (!next.includes(previousId)) {
        if (kind === 'geometry') deselectGeometryFromDeletionBasket(previousId); else deselectDataFromDeletionBasket(previousId);
      }
    }
    if (next.includes(id) && !selected.has(id)) {
      const result = kind === 'geometry' ? addGeometryToDeletionBasket(id) : addDataToDeletionBasket(id);
      if (!result.ok) setError(result.message);
    }
  };

  return (
    <div className="d-flex flex-column gap-3 small">
      {confirming || draft.step === 'committing' ? <p role="status">Saving changes…</p> : draft.step === 'setup' ? (
        <>
          <p className="mb-0">Choose the type of items to {operation}.</p>
          <div className="btn-group w-100">
            <button className="btn btn-outline-primary" type="button" onClick={() => onStartDelete({ deleteLink: true, deleteGeometry: true, deleteData: false })}>Geometry</button>
            <button className="btn btn-outline-primary annotation-data-action" type="button" onClick={() => onStartDelete({ deleteLink: true, deleteGeometry: false, deleteData: true })}>Data</button>
          </div>
        </>
      ) : (
        <>
          <h3 className="h6 mb-0 text-primary">{kind === 'geometry' ? 'Geometry' : 'Data'}</h3>
          <p className="mb-0">Select one or more {kind === 'geometry' ? 'geometries here or in the viewer' : 'data records here'}. {ids.length} selected.</p>
          <div className="list-group annotation-operation-list">
            {(kind === 'geometry' ? allGeometries : allData).filter((item) => item.erasableAt === null).map((item) => (
              <button key={item.id} type="button" className={'list-group-item list-group-item-action text-start ' + (selected.has(item.id) ? 'active' : '')}
                disabled={loading || (!selected.has(item.id) && blocked(item.id))} onClick={(event) => toggleEndpoint(item.id, event.ctrlKey || event.metaKey)} aria-pressed={selected.has(item.id)}>
                <AnnotationIndexBadge kind={kind} number={(kind === 'geometry' ? geometryNumbers : dataNumbers).get(item.id) ?? 0} />
                <span className="ms-2">{'label' in item ? item.label : 'Geometry'}</span>
              </button>
            ))}
          </div>
          {reviewing && projectLinks ? operation === 'unlink' ? (
            <div className={kind === 'geometry' ? 'annotation-counterparts-data' : 'annotation-counterparts-geometry'}>
              <h4 className="h6">Common relationships to {kind === 'geometry' ? 'Data' : 'Geometry'}</h4>
              {common.length === 0 ? <p className="text-muted">No active relationships are shared by all selected items.</p> : (
                <div className="list-group">
                  {common.map((id) => (
                    <button key={id} type="button" aria-pressed={counterparts.includes(id)}
                      className={'list-group-item list-group-item-action text-start d-flex align-items-center gap-2 ' + (counterparts.includes(id) ? 'active' : '')}
                      onClick={(event) => updateDeletionDraft({ selectedCounterpartIds: annotationListSelection(counterparts, id, event.ctrlKey || event.metaKey) })}>
                      <AnnotationIndexBadge kind={kind === 'geometry' ? 'data' : 'geometry'} number={(kind === 'geometry' ? dataNumbers : geometryNumbers).get(id) ?? 0} />
                      {kind === 'geometry' ? allData.find((item) => item.id === id)?.label ?? id : id}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 mb-0">{affected.length} relationships will be unlinked. Geometry and data remain available.</p>
            </div>
          ) : (
            <p className="alert alert-warning mb-0">Erase {ids.length} selected items and unlink all {affected.length} active relationships. Only the selected items will be hidden; their counterparts remain available.</p>
          ) : null}
        </>
      )}
      {error || setupError || draft.selectionMessage ? <p className="alert alert-warning mb-0" role="alert">{error ?? setupError ?? draft.selectionMessage}</p> : null}
      <div className="d-flex justify-content-between align-items-center gap-2">
        <button className="btn btn-outline-secondary" type="button" disabled={loading || confirming || draft.step === 'committing'} onClick={onBack}>Cancel</button>
        {draft.step === 'selecting' && !confirming ? (
          <button className={reviewing ? 'btn btn-primary' : 'btn btn-outline-primary'} type="button"
            disabled={loading || ids.length === 0 || (reviewing && operation === 'unlink' && counterparts.length === 0)}
            onClick={reviewing ? onConfirmDelete : () => void review()}>
            {loading ? 'Loading…' : 'Done'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
