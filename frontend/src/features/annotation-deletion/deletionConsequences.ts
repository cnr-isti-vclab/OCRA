import type { AnnotationData, AnnotationGeometry, AnnotationLink } from 'shared/annotation-types';

export type DeletionEndpointKind = 'geometry' | 'data';

export interface DeletionOrphan {
  kind: DeletionEndpointKind;
  id: string;
  wasErasable: boolean;
}

export interface DeletionConsequences {
  initialLinkCount: number;
  remainingLinkCount: number;
  newlyUnlinkedCounterparts: DeletionOrphan[];
}

/** Derive the impact of removing links using the project-wide relationship set. */
export function calculateDeletionConsequences(args: {
  endpointKind: DeletionEndpointKind;
  endpointId: string;
  selectedLinkIds: readonly string[];
  projectLinks: readonly AnnotationLink[];
  geometries: readonly Pick<AnnotationGeometry, 'id' | 'erasableAt'>[];
  data: readonly Pick<AnnotationData, 'id' | 'erasableAt'>[];
}): DeletionConsequences {
  const selected = new Set(args.selectedLinkIds);
  const activeLinks = args.projectLinks.filter((link) => link.erasableAt === null);
  const incident = activeLinks.filter((link) => args.endpointKind === 'geometry'
    ? link.geometryId === args.endpointId
    : link.dataId === args.endpointId);
  const counterparts = new Set(incident.filter((link) => selected.has(link.id)).map((link) => (
    args.endpointKind === 'geometry' ? link.dataId : link.geometryId
  )));
  const newlyUnlinkedCounterparts: DeletionOrphan[] = [];
  for (const id of counterparts) {
    const remaining = activeLinks.some((link) => !selected.has(link.id) && (
      args.endpointKind === 'geometry' ? link.dataId === id : link.geometryId === id
    ));
    if (remaining) continue;
    if (args.endpointKind === 'geometry') {
      const datum = args.data.find((entry) => entry.id === id);
      if (datum) newlyUnlinkedCounterparts.push({ kind: 'data', id, wasErasable: datum.erasableAt !== null });
    } else {
      const geometry = args.geometries.find((entry) => entry.id === id);
      if (geometry) newlyUnlinkedCounterparts.push({ kind: 'geometry', id, wasErasable: geometry.erasableAt !== null });
    }
  }

  return {
    initialLinkCount: incident.length,
    remainingLinkCount: incident.filter((link) => !selected.has(link.id)).length,
    newlyUnlinkedCounterparts,
  };
}
