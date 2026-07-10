import type { AnnotationScopeType, AnnotationShape } from 'shared/annotation-types';

/**
 * Draft types for the annotation creation wizard (M2+).
 * @see doc/annotation-creation.md
 */

export type AnnotationEntityChoice = 'new' | 'search' | 'void';

export type AnnotationCreationStep = 'setup' | 'geometry' | 'data' | 'committing';

/** Which search side may accumulate multiple selections when both sides search. */
export type AnnotationCreationMultiSide = 'geometry' | 'data' | null;

export interface AnnotationScopeDraft {
  referenceType: AnnotationScopeType;
  referenceId: string;
}

export interface AnnotationVisibilityDraft {
  visibilityType: AnnotationScopeType;
  visibilityId: string;
}

export interface AnnotationCreationSetupDraft {
  geometryChoice: AnnotationEntityChoice;
  dataChoice: AnnotationEntityChoice;
  geometryScope: AnnotationScopeDraft;
  dataVisibility: AnnotationVisibilityDraft;
  multiSide: AnnotationCreationMultiSide;
}

export interface AnnotationCreationDraft extends AnnotationCreationSetupDraft {
  step: AnnotationCreationStep;
  draftShapes: AnnotationShape[];
  selectedGeometryIds: string[];
  selectedDataIds: string[];
  newDataLabel: string;
  newDataDescription: string;
  newDataClass: string | null;
  newDataContent: Record<string, unknown>;
}
