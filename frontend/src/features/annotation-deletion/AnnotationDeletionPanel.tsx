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

/** Guided deletion of one endpoint and explicitly chosen relationships. */
export default function AnnotationDeletionPanel({ draft, setupError, onStartDelete, onBack, onConfirmDelete, confirming = false }: AnnotationDeletionPanelProps) {
  const { allLinks, allData, allGeometries, initDeletionDraft, clearDeletionBasket, updateDeletionDraft, loadProjectLinksForDeletion } = useAnnotationStore();
  const [projectLinks, setProjectLinks] = useState<AnnotationLink[] | null>(null);
  const [reviewLinks, setReviewLinks] = useState<AnnotationLink[] | null>(null);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepEndpointAvailable, setKeepEndpointAvailable] = useState<boolean | null>(null);
  const [eraseOrphanIds, setEraseOrphanIds] = useState<ReadonlySet<string>>(new Set());
  const [erasableOrphanChoices, setErasableOrphanChoices] = useState<ReadonlyMap<string, 'delete' | 'keep'>>(new Map());
  const endpointKind: DeletionEndpointKind = draft.targetKind ?? (draft.deleteGeometry ? 'geometry' : 'data');
  const endpointId = draft.targetId ?? undefined;
  const selectedLinkIds = draft.candidateLinkIds;
  const selectedKey = selectedLinkIds.join('|');
  const localLinkIds = useMemo(() => new Set(allLinks.map((link) => link.id)), [allLinks]);
  const localLinkKey = [...localLinkIds].sort().join('|');

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
    setEraseOrphanIds(new Set());
    setErasableOrphanChoices(new Map());
  }, [endpointId, selectedKey]);

  const incidentLinks = useMemo(() => (projectLinks ?? []).filter((link) => link.erasableAt === null && (endpointKind === 'geometry' ? link.geometryId === endpointId : link.dataId === endpointId)), [projectLinks, endpointKind, endpointId]);
  const endpointLabel = endpointKind === 'geometry'
    ? allGeometries.find((geometry) => geometry.id === endpointId)?.id ?? endpointId
    : allData.find((datum) => datum.id === endpointId)?.label?.trim() || endpointId;
  const consequences = reviewLinks && endpointId ? calculateDeletionConsequences({ endpointKind, endpointId, selectedLinkIds, projectLinks: reviewLinks, geometries: allGeometries, data: allData }) : null;

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
        setError('Choose at least one relationship to remove. Relationships in another scene must be managed from that scene.');
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
      const eraseRoot = consequences.remainingLinkCount > 0 || keepEndpointAvailable === false;
      const candidateGeometryIds = [
        ...(endpointKind === 'geometry' && eraseRoot ? [endpointId] : []),
        ...consequences.newlyUnlinkedCounterparts.filter((item) => item.kind === 'geometry' && eraseOrphanIds.has(item.id)).map((item) => item.id),
      ];
      const candidateDataIds = [
        ...(endpointKind === 'data' && eraseRoot ? [endpointId] : []),
        ...consequences.newlyUnlinkedCounterparts.filter((item) => item.kind === 'data' && eraseOrphanIds.has(item.id)).map((item) => item.id),
      ];
      const restoreGeometryIds = consequences.newlyUnlinkedCounterparts
        .filter((item) => item.kind === 'geometry' && item.wasErasable && erasableOrphanChoices.get(item.id) === 'keep')
        .map((item) => item.id);
      const restoreDataIds = consequences.newlyUnlinkedCounterparts
        .filter((item) => item.kind === 'data' && item.wasErasable && erasableOrphanChoices.get(item.id) === 'keep')
        .map((item) => item.id);
      if (selectedLinkIds.length === 0 && candidateGeometryIds.length === 0 && candidateDataIds.length === 0) {
        setError('No changes to save. Choose Delete or go Back.');
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
        <p className="mb-0" role="status">Saving deletion…</p>
      ) : draft.step === 'setup' ? (
        <>
          <div className="fw-semibold mb-2">What would you like to delete?</div>
          <p className="text-muted mb-2">Choose an item first. Its relationships appear in the next step.</p>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-danger btn-sm flex-fill" onClick={() => onStartDelete({ deleteGeometry: true, deleteData: false, deleteLink: true })}>Geometry</button>
            <button type="button" className="btn btn-outline-danger btn-sm flex-fill" onClick={() => onStartDelete({ deleteGeometry: false, deleteData: true, deleteLink: true })}>Data</button>
          </div>
        </>
      ) : !endpointId ? (
        <>
          <div className="fw-semibold mb-1">Select {endpointKind === 'geometry' ? 'a geometry in the viewer' : 'a data record in the list'}</div>
          <p className="text-muted mb-0">You will then choose which relationships to remove.</p>
          <div className="d-flex justify-content-between gap-2 mt-3">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={initDeletionDraft}>Change type</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>Cancel</button>
          </div>
        </>
      ) : reviewLinks && consequences ? (
        <>
          <div className="fw-semibold mb-2">Review deletion of {endpointLabel}</div>
          <p className="mb-2">{selectedLinkIds.length} relationship{selectedLinkIds.length === 1 ? '' : 's'} will be removed.</p>
          {consequences.remainingLinkCount > 0 ? (
            <p className="alert alert-info py-2 mb-2">This {endpointKind} will be marked erasable but remain visible through {consequences.remainingLinkCount} other relationship{consequences.remainingLinkCount === 1 ? '' : 's'}.</p>
          ) : (
            <fieldset className="border rounded p-2 mb-2">
              <legend className="float-none w-auto fs-6 px-1 mb-1">This {endpointKind} will have no relationships</legend>
              <label className="d-block mb-1"><input type="radio" name="deletion-root-outcome" checked={keepEndpointAvailable === false} onChange={() => setKeepEndpointAvailable(false)} />{' '}Delete it (mark erasable; it disappears)</label>
              <label className="d-block"><input type="radio" name="deletion-root-outcome" checked={keepEndpointAvailable === true} onChange={() => setKeepEndpointAvailable(true)} />{' '}Leave it available for future links</label>
            </fieldset>
          )}
          {consequences.newlyUnlinkedCounterparts.length > 0 ? (
            <div className="border rounded p-2 mb-2">
              <div className="fw-semibold mb-1">These items will become unlinked</div>
              <p className="text-muted mb-2">Choose explicitly when an already erasable item would disappear. Other items stay available unless selected.</p>
              {consequences.newlyUnlinkedCounterparts.map((item) => {
                const label = item.kind === 'data' ? allData.find((datum) => datum.id === item.id)?.label || item.id : item.id;
                return item.wasErasable ? (
                  <fieldset key={`${item.kind}:${item.id}`} className="border-top pt-2 mb-2">
                    <legend className="float-none w-auto fs-6 mb-1">{label} is already erasable and will disappear</legend>
                    <label className="d-block"><input type="radio" name={`orphan-${item.kind}-${item.id}`} checked={erasableOrphanChoices.get(item.id) === 'delete'} onChange={() => setErasableOrphanChoices(new Map(erasableOrphanChoices).set(item.id, 'delete'))} />{' '}Confirm deletion</label>
                    <label className="d-block"><input type="radio" name={`orphan-${item.kind}-${item.id}`} checked={erasableOrphanChoices.get(item.id) === 'keep'} onChange={() => setErasableOrphanChoices(new Map(erasableOrphanChoices).set(item.id, 'keep'))} />{' '}Restore and leave available</label>
                  </fieldset>
                ) : (
                  <label key={`${item.kind}:${item.id}`} className="d-block mb-1">
                    <input type="checkbox" checked={eraseOrphanIds.has(item.id)} onChange={() => {
                      const next = new Set(eraseOrphanIds);
                      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                      setEraseOrphanIds(next);
                    }} />{' '}Mark {item.kind} {label} erasable
                  </label>
                );
              })}
            </div>
          ) : null}
          <div className="d-flex justify-content-between gap-2 mt-3">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setReviewLinks(null)}>Back</button>
            <button type="button" className="btn btn-danger btn-sm" disabled={loadingLinks || confirming || (consequences.remainingLinkCount === 0 && keepEndpointAvailable === null) || consequences.newlyUnlinkedCounterparts.some((item) => item.wasErasable && !erasableOrphanChoices.has(item.id))} onClick={() => void confirm()}>{confirming ? 'Deleting…' : 'Confirm delete'}</button>
          </div>
        </>
      ) : (
        <>
          <div className="fw-semibold mb-2">{endpointLabel}</div>
          {loadingLinks ? <p className="text-muted">Loading relationships…</p> : (
            <>
              <p className="text-muted mb-2">Select the relationship{incidentLinks.length === 1 ? '' : 's'} to remove.</p>
              {incidentLinks.length === 0 ? <p className="mb-2">No relationships: choose whether to mark this item erasable in the next step.</p> : (
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
              )}
              {incidentLinks.some((link) => !localLinkIds.has(link.id)) ? <p className="text-muted">Relationships from other scenes are shown for context. Open that scene to remove them.</p> : null}
            </>
          )}
          <div className="d-flex justify-content-between gap-2 mt-3">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearDeletionBasket}>Choose another</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={loadingLinks || !projectLinks || (incidentLinks.length > 0 && selectedLinkIds.length === 0)} onClick={() => void review()}>Review</button>
          </div>
        </>
      )}
      {(error || setupError || draft.selectionMessage) ? <div className="alert alert-warning py-2 px-3 mt-2 mb-0" role="alert">{error || setupError || draft.selectionMessage}</div> : null}
    </div>
  );
}
