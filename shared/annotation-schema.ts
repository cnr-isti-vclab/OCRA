import { z } from 'zod';

const isoDateTimeSchema = z.string().datetime();

export const annotationScopeTypeSchema = z.enum(['scene', 'asset']);

export const annotationVertex3DSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
]);

/** Sparse controls used to regenerate a dense surface-following polyline. */
export const annotationSurfacePathSchema = z.object({
  mode: z.literal('view-projected'),
  controlVertices: z.array(annotationVertex3DSchema).min(2),
});

export const annotationShapePointsSchema = z.object({
  type: z.literal('ShapePoints'),
  vertices: z.array(annotationVertex3DSchema).min(1),
});

export const annotationShapePolylineSchema = z.object({
  type: z.literal('ShapePolyline'),
  vertices: z.array(annotationVertex3DSchema).min(2),
  surfacePath: annotationSurfacePathSchema.optional(),
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

/**
 * Human-readable metadata captured when an annotation class is selected.
 * `AnnotationData.class` remains the authoritative identifier; this object is
 * only a display snapshot and must never be used for identity comparisons.
 */
export const annotationClassDisplaySchema = z
  .object({
    provider: z.string().trim().min(1).max(64),
    preferredLabel: z.string().trim().min(1).max(500),
    language: z.string().trim().min(1).max(35).optional(),
  })
  .strict();

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
    classDisplay: annotationClassDisplaySchema.nullable().optional(),
    content: z.record(z.unknown()),
    visibilityType: annotationScopeTypeSchema,
    visibilityId: z.string().min(1),
  })
  .superRefine((datum, context) => {
    if (datum.class === null && datum.classDisplay != null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['classDisplay'],
        message: 'classDisplay requires a non-null class identifier',
      });
    }
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
