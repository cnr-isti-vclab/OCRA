/**
 * Shared annotation domain types.
 *
 * These types model the persisted OCRA annotation system described in
 * doc/a00-annotation-model.md. They are distinct from the viewer-oriented
 * annotation types in scene-types.ts.
 */

export type AnnotationScopeType = 'scene' | 'asset';

export type AnnotationVertex3D = [number, number, number];

export interface AnnotationShapePoints {
  type: 'ShapePoints';
  vertices: AnnotationVertex3D[];
}

export interface AnnotationShapePolyline {
  type: 'ShapePolyline';
  vertices: AnnotationVertex3D[];
}

export interface AnnotationShapePolygon {
  type: 'ShapePolygon';
  vertices: AnnotationVertex3D[];
}

export type AnnotationShape =
  | AnnotationShapePoints
  | AnnotationShapePolyline
  | AnnotationShapePolygon;

export interface AnnotationAuditFields {
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AnnotationVersionedFields {
  version: number;
}

export interface AnnotationErasableFields {
  erasableAt: string | null;
  erasableBy: string | null;
}

export interface AnnotationGeometry
  extends AnnotationAuditFields,
    AnnotationVersionedFields,
    AnnotationErasableFields {
  id: string;
  projectId: string;
  shapes: AnnotationShape[];
  referenceType: AnnotationScopeType;
  referenceId: string;
}

export interface AnnotationData
  extends AnnotationAuditFields,
    AnnotationVersionedFields,
    AnnotationErasableFields {
  id: string;
  projectId: string;
  label: string;
  description: string;
  class: string | null;
  content: Record<string, any>;
  visibilityType: AnnotationScopeType;
  visibilityId: string;
}

export interface AnnotationLink
  extends AnnotationAuditFields,
    AnnotationVersionedFields,
    AnnotationErasableFields {
  id: string;
  projectId: string;
  geometryId: string;
  dataId: string;
}

/**
 * Convenience aggregate for read models or frontend composition.
 * This is not a first-class persisted entity in the annotation model.
 */
export interface ResolvedAnnotation {
  geometry: AnnotationGeometry;
  data: AnnotationData;
  link: AnnotationLink;
}