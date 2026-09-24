import type { AnnotationScopeType, AnnotationShape } from 'shared/annotation-types';

/**
 * Draft types for the annotation creation wizard (batch geo/data).
 * @see doc/a07-annotation-creation.md
 */

/** Per-step mode: create, choose existing, or unset. */
export type AnnotationCreationSideMode = 'new' | 'choose' | null;

/** Viewer drawing primitive selected for new geometry. */
export type AnnotationDrawingMode = 'point' | 'line' | 'area';

/**
 * Wizard steps. Creation opens on the first side of `stepOrder`.
 */
export type AnnotationCreationStep = 'geometry' | 'data' | 'committing';

/** Which side is authored first in the wizard. */
export type AnnotationCreationStepOrder = 'geometry-first' | 'data-first';

export interface AnnotationScopeDraft {
  referenceType: AnnotationScopeType;
  referenceId: string;
}

export interface AnnotationVisibilityDraft {
  visibilityType: AnnotationScopeType;
  visibilityId: string;
}

/** One unsaved geometry produced in sticky New mode. */
export interface CreatedGeometryDraft {
  viewerId: string;
  shapes: AnnotationShape[];
}

/** One unsaved data record queued from the data form. */
export interface CreatedDataDraft {
  label: string;
  description: string;
  class: string | null;
  content: Record<string, unknown>;
}

/** Remembered session defaults (scopes + drawing tool + step order). */
export interface AnnotationCreationRememberedSetup {
  geometryScope: AnnotationScopeDraft;
  dataVisibility: AnnotationVisibilityDraft;
  drawingMode: AnnotationDrawingMode;
  stepOrder: AnnotationCreationStepOrder;
}

export interface AnnotationScopeOption {
  type: AnnotationScopeType;
  id: string;
  label: string;
}

export interface AnnotationCreationDraft {
  step: AnnotationCreationStep;
  stepOrder: AnnotationCreationStepOrder;
  drawingMode: AnnotationDrawingMode;
  geometryMode: AnnotationCreationSideMode;
  dataMode: AnnotationCreationSideMode;
  geometryScope: AnnotationScopeDraft;
  dataVisibility: AnnotationVisibilityDraft;
  /** Geometries drawn in New mode (exclusive with selectedGeometryIds). */
  createdGeometries: CreatedGeometryDraft[];
  /** Existing geometries picked in Choose mode. */
  selectedGeometryIds: string[];
  /** Data records confirmed from the create modal in New mode. */
  createdData: CreatedDataDraft[];
  /** Existing data picked in Choose mode. */
  selectedDataIds: string[];
  /** In-progress data form values (before append to createdData). */
  pendingDataLabel: string;
  pendingDataDescription: string;
  pendingDataClass: string | null;
  pendingDataContent: Record<string, unknown>;
}
