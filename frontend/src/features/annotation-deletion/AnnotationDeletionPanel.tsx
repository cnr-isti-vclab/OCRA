import { useEffect, useMemo, useState } from 'react';
import type { AnnotationLink } from 'shared/annotation-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import type { AnnotationDeletionDraft, AnnotationDeletionIntent } from './types';
import { calculateDeletionConsequences, type DeletionEndpointKind } from './deletionConsequences';

interface AnnotationDeletionPanelProps {
  draft: AnnotationDeletionDraft;
  setupError: string | null;
  onStartDelete: (intent: AnnotationDeletionIntent) => void;
  onBack: () => void;
  onConfirmDelete: () => void;
  confirming?: boolean;
}

function linkSignature(
  links: readonly AnnotationLink[],
  baseline: readonly AnnotationLink[],
  endpointKind: DeletionEndpointKind,
  endpointId: string,
  selectedLinkIds: readonly string[],
): string {
  const selected = new Set(selectedLinkIds);
  const counterparts = new Set(baseline.filter((link) => selected.has(link.id)).map((link) => (
    endpointKind === 'geometry' ? link.dataId : link.geometryId
  )));
  return links.filter((link) => endpointKind === 'geometry'
    ? link.geometryId === endpointId || counterparts.has(link.dataId)
    : link.dataId === endpointId || counterparts.has(link.geometryId))
    .map((link) => `${link.id}:${link.version}:${link.erasableAt ?? ''}`).sort().join('|');
}

function orphanKey(kind: DeletionEndpointKind, id: string): string {
  return `${kind}:${id}`;
}

/** Guided deletion of one endpoint and explicitly chosen relationships. */
export default function AnnotationDeletionPanel({ draft, setupError, onStartDelete, onBack, onConfirmDelete, confirming = false }: AnnotationDeletionPanelProps) {
  const { allLinks, allData, allGeometries, initDeletionDraft, clearDeletionBasket, updateDeletionDraft, loadProjectLinksForDeletion } = useAnnotationStore();
  const [projectLinks, setProjectLinks] = useState<AnnotationLink[] | null>(null);
  const [reviewLinks, setReviewLinks] = useState<AnnotationLink[] | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepEndpointAvailable, setKeepEndpointAvailable] = useState<boolean | null>(null);
  const [reviewingUnlinkedItems, setReviewingUnlinkedItems] = useState(false);
  const [erasableOrphanKeys, setErasableOrphanKeys] = useState<ReadonlySet<string>>(new Set());
  const endpointKind: DeletionEndpointKind = draft.targetKind ?? (draft.deleteGeometry ? 'geometry' : 'data');
  const endpointId = draft.targetId ?? undefined;
  const selectedLinkIds = draft.candidateLinkIds;
  const selectedKey = selectedLinkIds.join('|');
  const localLinkIds = useMemo(() => new Set(allLinks.map((link) => link.id)), [allLinks]);
  const localLinkKey = [...localLinkIds].sort().join('|');
  // Project-wide links are required before committing. While they are loading
  // or unavailable, local scene links remain useful context but are not treated
  // as a complete relationship set.
  const linksForDisplay = projectLinks ?? allLinks;

  useEffect(() => {
    if (!endpointId || draft.step !== 'selecting') { setProjectLinks(null); return; }
    let cancelled = false;
    setLoadingLinks(true);
    setProjectLinks(null);
    setReviewLinks(null);
    setError(null);
    void loadProjectLinksForDeletion().then((links) => {
      if (cancelled) return;
      setProjectLinks(links);
      const incident = links.filter((link) => link.erasableAt === null && (endpointKind === 'geometry' ? link.geometryId === endpointId : link.dataId === endpointId));
      if (incident.length === 1 && localLinkIds.has(incident[0]!.id)) updateDeletionDraft({ candidateLinkIds: [incident[0]!.id] });
      else if (incident.length > 1) updateDeletionDraft({ candidateLinkIds: [] });
    }).catch(() => {
      if (!cancelled) setError('Could not load all relationships. Try selecting the item again.');
    }).finally(() => { if (!cancelled) setLoadingLinks(false); });
    return () => { cancelled = true; };
  }, [draft.step, endpointId, endpointKind, loadProjectLinksForDeletion, localLinkKey, updateDeletionDraft]);

  useEffect(() => {
    setReviewLinks(null);
    setKeepEndpointAvailable(null);
    setReviewingUnlinkedItems(false);
    setErasableOrphanKeys(new Set());
  }, [endpointId, selectedKey]);

  const incidentLinks = useMemo(() => linksForDisplay.filter((link) => link.erasableAt === null && (endpointKind === 'geometry' ? link.geometryId === endpointId : link.dataId === endpointId)), [linksForDisplay, endpointKind, endpointId]);
  const endpointLabel = endpointKind === 'geometry'
    ? allGeometries.find((geometry) => geometry.id === endpointId)?.id ?? endpointId
    : allData.find((datum) => datum.id === endpointId)?.label?.trim() || endpointId;
  const consequences = reviewLinks && endpointId ? calculateDeletionConsequences({ endpointKind, endpointId, selectedLinkIds, projectLinks: reviewLinks, geometries: allGeometries, data: allData }) : null;
  const deletesRootEndpoint = consequences?.remainingLinkCount === 0
    && (consequences.initialLinkCount === 0 || keepEndpointAvailable === false);
  const deletesOrphanEndpoint = Boolean(consequences?.newlyUnlinkedCounterparts.some((item) => (
    erasableOrphanKeys.has(orphanKey(item.kind, item.id))
  )));
  const deletesAnyEndpoint = deletesRootEndpoint || deletesOrphanEndpoint;
  const confirmLabel = reviewingUnlinkedItems
    ? 'Confirm'
    : deletesAnyEndpoint
      ? selectedLinkIds.length > 0 ? 'Unlink and delete' : 'Confirm delete'
      : 'Confirm unlink';

  const orphanLabel = (kind: DeletionEndpointKind, id: string): string => {
    if (kind === 'geometry') {
      return id;
    }
    return allData.find((datum) => datum.id === id)?.label?.trim() || id;
  };

  const toggleLink = (linkId: string) => {
    const next = new Set(selectedLinkIds);
    if (next.has(linkId)) next.delete(linkId); else next.add(linkId);
    updateDeletionDraft({ candidateLinkIds: [...next] });
    setError(null);
  };

  const review = async () => {
    if (!endpointId) return;
    setLoadingLinks(true);
    setError(null);
    try {
      const latest = await loadProjectLinksForDeletion();
      const incident = latest.filter((link) => link.erasableAt === null && (endpointKind === 'geometry' ? link.geometryId === endpointId : link.dataId === endpointId));
      if (incident.length > 0 && !incident.some((link) => selectedLinkIds.includes(link.id))) {
        setError('Choose at least one relationship to unlink. Relationships in another scene must be managed from that scene.');
        setProjectLinks(latest);
        return;
      }
      if (selectedLinkIds.some((id) => !incident.some((link) => link.id === id))) {
        setError('The relationships changed. Review the list and try again.');
        setProjectLinks(latest);
        return;
      }
      setProjectLinks(latest);
      setReviewLinks(latest);
    } catch {
      setError('Could not verify the relationships. Please try again.');
    } finally { setLoadingLinks(false); }
  };

  const confirm = async () => {
    if (!reviewLinks || !endpointId || !consequences) return;
    setLoadingLinks(true);
    setError(null);
    try {
      const latest = await loadProjectLinksForDeletion();
      if (linkSignature(latest, reviewLinks, endpointKind, endpointId, selectedLinkIds)
        !== linkSignature(reviewLinks, reviewLinks, endpointKind, endpointId, selectedLinkIds)) {
        setReviewLinks(null);
        setProjectLinks(latest);
        setError('Relationships changed while you were reviewing. Check the updated list.');
        return;
      }
      // An endpoint can disappear only after every active relationship has been
      // removed. With any remaining relationship it stays available for use.
      const eraseRoot = consequences.remainingLinkCount === 0
        && (consequences.initialLinkCount === 0 || keepEndpointAvailable === false);
      const candidateGeometryIds = [
        ...(endpointKind === 'geometry' && eraseRoot ? [endpointId] : []),
        ...consequences.newlyUnlinkedCounterparts
          .filter((item) => item.kind === 'geometry' && erasableOrphanKeys.has(orphanKey(item.kind, item.id)) && !item.wasErasable)
          .map((item) => item.id),
      ];
      const candidateDataIds = [
        ...(endpointKind === 'data' && eraseRoot ? [endpointId] : []),
        ...consequences.newlyUnlinkedCounterparts
          .filter((item) => item.kind === 'data' && erasableOrphanKeys.has(orphanKey(item.kind, item.id)) && !item.wasErasable)
          .map((item) => item.id),
      ];
      const restoreGeometryIds = consequences.newlyUnlinkedCounterparts
        .filter((item) => item.kind === 'geometry' && item.wasErasable && !erasableOrphanKeys.has(orphanKey(item.kind, item.id)))
        .map((item) => item.id);
      const restoreDataIds = consequences.newlyUnlinkedCounterparts
        .filter((item) => item.kind === 'data' && item.wasErasable && !erasableOrphanKeys.has(orphanKey(item.kind, item.id)))
        .map((item) => item.id);
      if (selectedLinkIds.length === 0 && candidateGeometryIds.length === 0 && candidateDataIds.length === 0) {
        setError('No changes to save. Choose an outcome or go Back.');
        return;
      }
      updateDeletionDraft({ candidateGeometryIds, candidateDataIds, restoreGeometryIds, restoreDataIds });
      onConfirmDelete();
    } catch {
      setError('Could not verify the relationships. Please try again.');
    } finally { setLoadingLinks(false); }
  };

  return (
    <div className="border rounded p-3 mb-3 bg-light-subtle small">
      {draft.step === 'committing' || confirming ? (
        <p className="mb-0" role="status">Saving changes…</p>
      ) : draft.step === 'setup' ? (
        <>
          <div className="fw-semibold mb-2">What would you like to unlink or delete?</div>
          <p className="text-muted mb-2">Choose an item first. You can unlink its relationships and, when none remain, decide whether to delete the item.</p>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-danger btn-sm flex-fill" onClick={() => onStartDelete({ deleteGeometry: true, deleteData: false, deleteLink: true })}>Geometry</button>
            <button type="button" className="btn btn-outline-danger btn-sm flex-fill" onClick={() => onStartDelete({ deleteGeometry: false, deleteData: true, deleteLink: true })}>Data</button>
          </div>
          <div className="d-flex justify-content-end mt-3">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>Cancel</button>
          </div>
        </>
      ) : !endpointId ? (
        <>
          <div className="fw-semibold mb-1">Select {endpointKind === 'geometry' ? 'a geometry in the viewer' : 'a data record in the list'}</div>
          <p className="text-muted mb-0">You will then choose which relationships to unlink.</p>
          <div className="d-flex justify-content-between gap-2 mt-3">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={initDeletionDraft}>Change type</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>Cancel</button>
          </div>
        </>
      ) : reviewLinks && consequences && reviewingUnlinkedItems ? (
        <>
          <div className="fw-semibold mb-2">Review unlinked items</div>
          <p className="text-muted mb-2">These items will have no relationships after the unlink. Leave an item unchecked to keep it available.</p>
          <div className="list-group mb-2">
            {consequences.newlyUnlinkedCounterparts.map((item) => {
              const key = orphanKey(item.kind, item.id);
              const markedForDeletion = erasableOrphanKeys.has(key);
              return (
                <label key={key} className="list-group-item d-flex align-items-center gap-2">
                  <input
                    type="checkbox"
                    className="form-check-input m-0"
                    checked={markedForDeletion}
                    onChange={() => setErasableOrphanKeys((current) => {
                      const next = new Set(current);
                      if (next.has(key)) next.delete(key); else next.add(key);
                      return next;
                    })}
                  />
                  <span className="flex-grow-1 text-truncate">Delete {orphanLabel(item.kind, item.id)}</span>
                </label>
              );
            })}
          </div>
          <div className="d-flex justify-content-between gap-2 mt-3">
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setReviewingUnlinkedItems(false)}>Back</button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>Cancel</button>
            </div>
            <button type="button" className={`btn btn-sm ${deletesAnyEndpoint ? 'btn-danger' : 'btn-warning'}`} disabled={loadingLinks || confirming} onClick={() => void confirm()}>{confirming ? 'Saving…' : confirmLabel}</button>
          </div>
        </>
      ) : reviewLinks && consequences ? (
        <>
          <div className="fw-semibold mb-2">Review changes to {endpointLabel}</div>
          <p className="mb-2">{selectedLinkIds.length} relationship{selectedLinkIds.length === 1 ? '' : 's'} will be unlinked.</p>
          {consequences.remainingLinkCount > 0 ? (
            <p className="alert alert-info py-2 mb-2">{consequences.remainingLinkCount} relationship{consequences.remainingLinkCount === 1 ? '' : 's'} will remain. This {endpointKind} stays available and cannot be deleted while it is still linked.</p>
          ) : consequences.initialLinkCount === 0 ? (
            <p className="alert alert-warning py-2 mb-2">This {endpointKind} has no relationships and will be deleted.</p>
          ) : (
            <fieldset className="border rounded p-2 mb-2">
              <legend className="float-none w-auto fs-6 px-1 mb-1">This {endpointKind} will have no relationships</legend>
              <label className="d-block mb-1"><input type="radio" name="deletion-root-outcome" checked={keepEndpointAvailable === true} onChange={() => setKeepEndpointAvailable(true)} />{' '}Just unlink it</label>
              <label className="d-block"><input type="radio" name="deletion-root-outcome" checked={keepEndpointAvailable === false} onChange={() => setKeepEndpointAvailable(false)} />{' '}Unlink and delete the {endpointKind}</label>
            </fieldset>
          )}
          <div className="d-flex justify-content-between gap-2 mt-3">
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setReviewLinks(null)}>Back</button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>Cancel</button>
            </div>
            <button
              type="button"
              className={`btn btn-sm ${deletesRootEndpoint ? 'btn-danger' : 'btn-warning'}`}
              disabled={loadingLinks || confirming || (consequences.remainingLinkCount === 0 && consequences.initialLinkCount > 0 && keepEndpointAvailable === null)}
              onClick={() => {
                if (consequences.newlyUnlinkedCounterparts.length > 0) {
                  setReviewingUnlinkedItems(true);
                  return;
                }
                void confirm();
              }}
            >
              {consequences.newlyUnlinkedCounterparts.length > 0 ? 'Continue' : confirming ? 'Saving…' : confirmLabel}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="fw-semibold mb-2">{endpointLabel}</div>
          {loadingLinks ? <p className="text-muted">Loading relationships…</p> : (
            <>
              <p className="text-muted mb-2">Select the relationship{incidentLinks.length === 1 ? '' : 's'} to unlink.</p>
              {projectLinks === null ? (
                <p className="alert alert-warning py-2 mb-2">Could not verify all project relationships. The relationships shown below are from this scene only; choose the item again to retry.</p>
              ) : null}
              {incidentLinks.length === 0 && projectLinks !== null ? <p className="mb-2">No relationships: in the next step, choose whether to delete this item or keep it available.</p> : null}
              {incidentLinks.length > 0 ? (
                <div className="list-group mb-2">
                  {incidentLinks.map((link) => {
                    const counterpartId = endpointKind === 'geometry' ? link.dataId : link.geometryId;
                    const counterpartLabel = endpointKind === 'geometry' ? allData.find((datum) => datum.id === counterpartId)?.label?.trim() || counterpartId : counterpartId;
                    const availableHere = localLinkIds.has(link.id);
                    return (
                      <label key={link.id} className="list-group-item d-flex align-items-center gap-2">
                        <input type="checkbox" className="form-check-input m-0" checked={selectedLinkIds.includes(link.id)} disabled={!availableHere} onChange={() => toggleLink(link.id)} />
                        <span className="text-truncate">{counterpartLabel}</span>
                        {!availableHere ? <span className="badge text-bg-light border ms-auto">Other scene</span> : null}
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {incidentLinks.some((link) => !localLinkIds.has(link.id)) ? <p className="text-muted">Relationships from other scenes are shown for context. Open that scene to remove them.</p> : null}
            </>
          )}
          <div className="d-flex justify-content-between gap-2 mt-3">
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearDeletionBasket}>Choose another</button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>Cancel</button>
            </div>
            <button type="button" className="btn btn-primary btn-sm" disabled={loadingLinks || !projectLinks || (incidentLinks.length > 0 && selectedLinkIds.length === 0)} onClick={() => void review()}>Review</button>
          </div>
        </>
      )}
      {(error || setupError || draft.selectionMessage) ? <div className="alert alert-warning py-2 px-3 mt-2 mb-0" role="alert">{error || setupError || draft.selectionMessage}</div> : null}
    </div>
  );
}
