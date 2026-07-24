import type { AnnotationData, AnnotationGeometry, AnnotationLink } from 'shared/annotation-types';
import type { AnnotationDeletionDraft } from './types';
import { validateDeletionBasket } from './annotationDeletionBasket';

export type DeletionCommitEntityKind = 'link' | 'geometry' | 'data';

export interface DeletionCommitPlanItem {
  kind: DeletionCommitEntityKind;
  id: string;
  expectedVersion: number;
}

export interface DeletionCommitPlan {
  items: DeletionCommitPlanItem[];
}

export interface DeletionCommitEntityLookup {
  getLink: (id: string) => AnnotationLink | undefined;
  getGeometry: (id: string) => AnnotationGeometry | undefined;
  getData: (id: string) => AnnotationData | undefined;
  links: Iterable<AnnotationLink>;
}

/**
 * Ordered commit plan: links → geometries → data, with OCC versions snapshot.
 */
export function buildDeletionCommitPlan(
  draft: AnnotationDeletionDraft,
  lookup: DeletionCommitEntityLookup,
): { ok: true; plan: DeletionCommitPlan } | { ok: false; message: string } {
  const validation = validateDeletionBasket(draft, { links: lookup.links });
  if (!validation.ok) {
    return { ok: false, message: validation.message ?? 'Deletion basket is not ready to commit.' };
  }

  const items: DeletionCommitPlanItem[] = [];

  for (const linkId of draft.candidateLinkIds) {
    const link = lookup.getLink(linkId);
    if (!link) {
      return { ok: false, message: `Link ${linkId} is missing from the local store. Refresh and try again.` };
    }
    if (link.erasableAt !== null) {
      continue;
    }
    items.push({ kind: 'link', id: linkId, expectedVersion: link.version });
  }

  if (draft.deleteGeometry) {
    for (const geometryId of draft.candidateGeometryIds) {
      const geometry = lookup.getGeometry(geometryId);
      if (!geometry) {
        return {
          ok: false,
          message: `Geometry ${geometryId} is missing from the local store. Refresh and try again.`,
        };
      }
      if (geometry.erasableAt !== null) {
        continue;
      }
      items.push({ kind: 'geometry', id: geometryId, expectedVersion: geometry.version });
    }
  }

  if (draft.deleteData) {
    for (const dataId of draft.candidateDataIds) {
      const datum = lookup.getData(dataId);
      if (!datum) {
        return {
          ok: false,
          message: `Data ${dataId} is missing from the local store. Refresh and try again.`,
        };
      }
      if (datum.erasableAt !== null) {
        continue;
      }
      items.push({ kind: 'data', id: dataId, expectedVersion: datum.version });
    }
  }

  if (items.length === 0) {
    return { ok: false, message: 'Nothing left to delete after filtering erasable entities.' };
  }

  return { ok: true, plan: { items } };
}
