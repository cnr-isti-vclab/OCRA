import type { AnnotationLink } from 'shared/annotation-types';
import type { AnnotationDeletionDraft } from './types';
import type { AnnotationLinkViewMode } from '../annotation-link-view/annotationLinkViewMode';

/** Non-erasable links attached to a geometry. */
export function nonErasableLinksForGeometry(
  links: Iterable<AnnotationLink>,
  geometryId: string,
): AnnotationLink[] {
  return [...links].filter(
    (link) => link.geometryId === geometryId && link.erasableAt === null,
  );
}

/** Non-erasable links attached to a data record. */
export function nonErasableLinksForData(
  links: Iterable<AnnotationLink>,
  dataId: string,
): AnnotationLink[] {
  return [...links].filter(
    (link) => link.dataId === dataId && link.erasableAt === null,
  );
}

export function isOneToManyLinks(links: readonly AnnotationLink[]): boolean {
  return links.length > 1;
}

/**
 * Link view mode from delete intent (a08 selection phase).
 * Full triplet uses `showAll` so either endpoint can be selected for 1:1.
 */
export function resolveDeletionLinkViewMode(
  draft: Pick<AnnotationDeletionDraft, 'deleteLink' | 'deleteGeometry' | 'deleteData'>,
): AnnotationLinkViewMode {
  if (draft.deleteGeometry && !draft.deleteData) {
    return 'selectGeometry';
  }
  if (draft.deleteData && !draft.deleteGeometry) {
    return 'selectData';
  }
  return 'showAll';
}

/**
 * Focus anchors for link-view filtering during deletion.
 * Link+Geo / Link+Data drive the opposite side from the basket; other intents
 * return null so the normal focus / showAll path is used.
 */
export function resolveDeletionLinkViewFocus(
  draft: Pick<
    AnnotationDeletionDraft,
    'deleteGeometry' | 'deleteData' | 'candidateGeometryIds' | 'candidateDataIds'
  >,
): { focusedGeometryIds: Set<string>; focusedDataIds: Set<string> } | null {
  if (draft.deleteGeometry && !draft.deleteData) {
    return {
      focusedGeometryIds: new Set(draft.candidateGeometryIds),
      focusedDataIds: new Set(),
    };
  }
  if (draft.deleteData && !draft.deleteGeometry) {
    return {
      focusedGeometryIds: new Set(),
      focusedDataIds: new Set(draft.candidateDataIds),
    };
  }
  return null;
}
