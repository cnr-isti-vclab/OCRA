import { z } from 'zod';

const isoDateTimeSchema = z.string().datetime();

export const annotationScopeTypeSchema = z.enum(['scene', 'asset']);

export const annotationVertex3DSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
]);

export const annotationShapePointsSchema = z.object({
  type: z.literal('ShapePoints'),
  vertices: z.array(annotationVertex3DSchema).min(1),
});

export const annotationShapePolylineSchema = z.object({
  type: z.literal('ShapePolyline'),
  vertices: z.array(annotationVertex3DSchema).min(2),
});

export const annotationShapePolygonSchema = z.object({
  type: z.literal('ShapePolygon'),
  vertices: z.array(annotationVertex3DSchema).min(3),
});

export const annotationShapeSchema = z.discriminatedUnion('type', [
  annotationShapePointsSchema,
  annotationShapePolylineSchema,
  annotationShapePolygonSchema,
]);

export const annotationAuditFieldsSchema = z.object({
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1),
  updatedAt: isoDateTimeSchema,
  updatedBy: z.string().min(1),
});

export const annotationVersionedFieldsSchema = z.object({
  version: z.number().int().nonnegative(),
});

export const annotationErasableFieldsSchema = z.object({
  erasableAt: isoDateTimeSchema.nullable(),
  erasableBy: z.string().min(1).nullable(),
});

export const annotationGeometrySchema = annotationAuditFieldsSchema
  .merge(annotationVersionedFieldsSchema)
  .merge(annotationErasableFieldsSchema)
  .extend({
    id: z.string().min(1),
    projectId: z.string().min(1),
    shapes: z.array(annotationShapeSchema).min(1),
    referenceType: annotationScopeTypeSchema,
    referenceId: z.string().min(1),
  });

export const annotationDataSchema = annotationAuditFieldsSchema
  .merge(annotationVersionedFieldsSchema)
  .merge(annotationErasableFieldsSchema)
  .extend({
    id: z.string().min(1),
    projectId: z.string().min(1),
    label: z.string().min(1),
    description: z.string(),
    class: z.string().min(1).nullable(),
    content: z.record(z.unknown()),
    visibilityType: annotationScopeTypeSchema,
    visibilityId: z.string().min(1),
  });

export const annotationLinkSchema = annotationAuditFieldsSchema
  .merge(annotationVersionedFieldsSchema)
  .merge(annotationErasableFieldsSchema)
  .extend({
    id: z.string().min(1),
    projectId: z.string().min(1),
    geometryId: z.string().min(1),
    dataId: z.string().min(1),
  });

export const resolvedAnnotationSchema = z.object({
  geometry: annotationGeometrySchema,
  data: annotationDataSchema,
  link: annotationLinkSchema,
});
