/**
 * Shared annotation domain types.
 *
 * These types are derived from the canonical Zod schemas in
 * annotation-schema.ts. They model the persisted OCRA annotation system
 * described in doc/a00-annotation-model.md and remain distinct from the
 * viewer-oriented annotation types in scene-types.ts.
 */
import type { z } from 'zod';
import {
  annotationAuditFieldsSchema,
  annotationDataSchema,
  annotationErasableFieldsSchema,
  annotationGeometrySchema,
  annotationLinkSchema,
  annotationScopeTypeSchema,
  annotationShapePointsSchema,
  annotationShapePolygonSchema,
  annotationShapePolylineSchema,
  annotationShapeSchema,
  annotationVersionedFieldsSchema,
  annotationVertex3DSchema,
  resolvedAnnotationSchema,
} from './annotation-schema.ts';

export type AnnotationScopeType = z.infer<typeof annotationScopeTypeSchema>;

export type AnnotationVertex3D = z.infer<typeof annotationVertex3DSchema>;

export type AnnotationShapePoints = z.infer<typeof annotationShapePointsSchema>;

export type AnnotationShapePolyline = z.infer<typeof annotationShapePolylineSchema>;

export type AnnotationShapePolygon = z.infer<typeof annotationShapePolygonSchema>;

export type AnnotationShape = z.infer<typeof annotationShapeSchema>;

export type AnnotationAuditFields = z.infer<typeof annotationAuditFieldsSchema>;

export type AnnotationVersionedFields = z.infer<typeof annotationVersionedFieldsSchema>;

export type AnnotationErasableFields = z.infer<typeof annotationErasableFieldsSchema>;

export type AnnotationGeometry = z.infer<typeof annotationGeometrySchema>;

export type AnnotationData = z.infer<typeof annotationDataSchema>;

export type AnnotationLink = z.infer<typeof annotationLinkSchema>;

/**
 * Convenience aggregate for read models or frontend composition.
 * This is not a first-class persisted entity in the annotation model.
 */
export type ResolvedAnnotation = z.infer<typeof resolvedAnnotationSchema>;