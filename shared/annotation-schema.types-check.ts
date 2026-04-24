import {
  annotationDataSchema,
  annotationGeometrySchema,
  annotationLinkSchema,
  annotationScopeTypeSchema,
  resolvedAnnotationSchema,
} from './annotation-schema.ts';
import type {
  AnnotationData,
  AnnotationGeometry,
  AnnotationLink,
  AnnotationScopeType,
  ResolvedAnnotation,
} from './annotation-types.ts';

const scope: AnnotationScopeType = annotationScopeTypeSchema.parse('scene');

const geometry: AnnotationGeometry = annotationGeometrySchema.parse({
  id: 'geom_1',
  projectId: 'project_1',
  shapes: [
    {
      type: 'ShapePoints',
      vertices: [[0, 0, 0]],
    },
  ],
  referenceType: scope,
  referenceId: 'scene_1',
  version: 0,
  erasableAt: null,
  erasableBy: null,
  createdAt: '2026-03-11T10:00:00.000Z',
  createdBy: 'user_1',
  updatedAt: '2026-03-11T10:00:00.000Z',
  updatedBy: 'user_1',
});

const data: AnnotationData = annotationDataSchema.parse({
  id: 'data_1',
  projectId: 'project_1',
  label: 'Example',
  description: 'Example annotation',
  class: null,
  content: { severity: 'low' },
  visibilityType: 'scene',
  visibilityId: 'scene_1',
  version: 0,
  erasableAt: null,
  erasableBy: null,
  createdAt: '2026-03-11T10:00:00.000Z',
  createdBy: 'user_1',
  updatedAt: '2026-03-11T10:00:00.000Z',
  updatedBy: 'user_1',
});

const link: AnnotationLink = annotationLinkSchema.parse({
  id: 'link_1',
  projectId: 'project_1',
  geometryId: geometry.id,
  dataId: data.id,
  version: 0,
  erasableAt: null,
  erasableBy: null,
  createdAt: '2026-03-11T10:00:00.000Z',
  createdBy: 'user_1',
  updatedAt: '2026-03-11T10:00:00.000Z',
  updatedBy: 'user_1',
});

const resolved: ResolvedAnnotation = resolvedAnnotationSchema.parse({
  geometry,
  data,
  link,
});

void resolved;
