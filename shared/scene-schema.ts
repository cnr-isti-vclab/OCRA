import { z } from 'zod';

/**
 * Runtime schema for a 3D vector `[x, y, z]`.
 */
export const vector3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);

/**
 * Runtime schema for scene scale, either uniform or per-axis.
 */
export const sceneScaleSchema = z.union([
  z.number().finite(),
  vector3Schema,
]);

/**
 * Runtime schema for a scene asset reference stored in HDT scenes.
 */
export const sceneAssetReferenceSchema = z.object({
  assetId: z.string().trim().min(1),
  visible: z.boolean().optional(),
  position: vector3Schema.optional(),
  rotation: vector3Schema.optional(),
  scale: sceneScaleSchema.optional(),
}).strict();

/**
 * Runtime schema for partial updates sent to
 * `PUT /api/projects/{projectId}/hdt/scenes/{sceneId}/assets/{assetId}`.
 */
export const sceneAssetReferenceUpdateSchema = z.object({
  visible: z.boolean().optional(),
  position: vector3Schema.optional(),
  rotation: vector3Schema.optional(),
  scale: sceneScaleSchema.optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'At least one field must be provided.' },
);

export type SceneAssetReferenceInput = z.infer<typeof sceneAssetReferenceSchema>;
export type SceneAssetReferenceUpdateInput = z.infer<typeof sceneAssetReferenceUpdateSchema>;

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'request';
    return `${path}: ${issue.message}`;
  });
}
