import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  annotationDataSchema,
  annotationGeometrySchema,
  annotationLinkSchema,
  resolvedAnnotationSchema,
} from './annotation-schema.ts';
import type {
  AnnotationData,
  AnnotationGeometry,
  AnnotationLink,
  ResolvedAnnotation,
} from './annotation-types.ts';

describe('annotation schema', () => {
  it('parses a valid annotation geometry and matches the inferred type', () => {
    const payload = {
      id: 'geom_1',
      projectId: 'project_1',
      shapes: [
        {
          type: 'ShapePolygon',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
            [1, 1, 0],
          ],
        },
      ],
      referenceType: 'scene',
      referenceId: 'scene_1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-03-11T10:00:00.000Z',
      createdBy: 'user_1',
      updatedAt: '2026-03-11T10:00:00.000Z',
      updatedBy: 'user_1',
    };

    const parsed = annotationGeometrySchema.parse(payload);
    const geometry: AnnotationGeometry = parsed;

    expect(geometry.referenceType).toBe('scene');
    expect(geometry.shapes).toHaveLength(1);
    expectTypeOf(parsed).toEqualTypeOf<AnnotationGeometry>();
  });

  it('rejects invalid shape constraints', () => {
    const result = annotationGeometrySchema.safeParse({
      id: 'geom_2',
      projectId: 'project_1',
      shapes: [
        {
          type: 'ShapePolyline',
          vertices: [[0, 0, 0]],
        },
      ],
      referenceType: 'asset',
      referenceId: 'asset_1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-03-11T10:00:00.000Z',
      createdBy: 'user_1',
      updatedAt: '2026-03-11T10:00:00.000Z',
      updatedBy: 'user_1',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty shapes and invalid reference types', () => {
    const emptyShapesResult = annotationGeometrySchema.safeParse({
      id: 'geom_3',
      projectId: 'project_1',
      shapes: [],
      referenceType: 'scene',
      referenceId: 'scene_1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-03-11T10:00:00.000Z',
      createdBy: 'user_1',
      updatedAt: '2026-03-11T10:00:00.000Z',
      updatedBy: 'user_1',
    });

    const invalidScopeResult = annotationGeometrySchema.safeParse({
      id: 'geom_4',
      projectId: 'project_1',
      shapes: [
        {
          type: 'ShapePoints',
          vertices: [[0, 0, 0]],
        },
      ],
      referenceType: 'project',
      referenceId: 'scene_1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-03-11T10:00:00.000Z',
      createdBy: 'user_1',
      updatedAt: '2026-03-11T10:00:00.000Z',
      updatedBy: 'user_1',
    });

    expect(emptyShapesResult.success).toBe(false);
    expect(invalidScopeResult.success).toBe(false);
  });

  it('rejects invalid polygon cardinality and malformed timestamps', () => {
    const invalidPolygonResult = annotationGeometrySchema.safeParse({
      id: 'geom_5',
      projectId: 'project_1',
      shapes: [
        {
          type: 'ShapePolygon',
          vertices: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        },
      ],
      referenceType: 'scene',
      referenceId: 'scene_1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: 'not-a-date',
      createdBy: 'user_1',
      updatedAt: '2026-03-11T10:00:00.000Z',
      updatedBy: 'user_1',
    });

    expect(invalidPolygonResult.success).toBe(false);
  });

  it('parses valid annotation data and link payloads', () => {
    const dataPayload = {
      id: 'data_1',
      projectId: 'project_1',
      label: 'Lacuna',
      description: 'Surface loss',
      class: 'damage',
      content: {
        severity: 'medium',
      },
      visibilityType: 'asset',
      visibilityId: 'asset_1',
      version: 1,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-03-11T10:00:00.000Z',
      createdBy: 'user_1',
      updatedAt: '2026-03-11T10:00:00.000Z',
      updatedBy: 'user_1',
    };

    const linkPayload = {
      id: 'link_1',
      projectId: 'project_1',
      geometryId: 'geom_1',
      dataId: 'data_1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-03-11T10:00:00.000Z',
      createdBy: 'user_1',
      updatedAt: '2026-03-11T10:00:00.000Z',
      updatedBy: 'user_1',
    };

    const data = annotationDataSchema.parse(dataPayload);
    const link = annotationLinkSchema.parse(linkPayload);

    const typedData: AnnotationData = data;
    const typedLink: AnnotationLink = link;

    expect(typedData.visibilityType).toBe('asset');
    expect(typedLink.dataId).toBe('data_1');
    expectTypeOf(data).toEqualTypeOf<AnnotationData>();
    expectTypeOf(link).toEqualTypeOf<AnnotationLink>();
  });

  it('rejects invalid annotation data and link payloads', () => {
    const invalidDataResult = annotationDataSchema.safeParse({
      id: 'data_2',
      projectId: 'project_1',
      label: '',
      description: 'Surface loss',
      class: null,
      content: {},
      visibilityType: 'invalid-scope',
      visibilityId: 'asset_1',
      version: 0,
      erasableAt: null,
      erasableBy: null,
      createdAt: '2026-03-11T10:00:00.000Z',
      createdBy: 'user_1',
      updatedAt: 'invalid-date',
      updatedBy: 'user_1',
    });

    const invalidLinkResult = annotationLinkSchema.safeParse({
      id: 'link_2',
      projectId: 'project_1',
      geometryId: '',
      dataId: 'data_1',
      version: -1,
      erasableAt: null,
      erasableBy: '',
      createdAt: '2026-03-11T10:00:00.000Z',
      createdBy: 'user_1',
      updatedAt: '2026-03-11T10:00:00.000Z',
      updatedBy: 'user_1',
    });

    expect(invalidDataResult.success).toBe(false);
    expect(invalidLinkResult.success).toBe(false);
  });

  it('parses a resolved annotation aggregate', () => {
    const payload = {
      geometry: {
        id: 'geom_1',
        projectId: 'project_1',
        shapes: [
          {
            type: 'ShapePoints',
            vertices: [[0, 0, 0]],
          },
        ],
        referenceType: 'scene',
        referenceId: 'scene_1',
        version: 0,
        erasableAt: null,
        erasableBy: null,
        createdAt: '2026-03-11T10:00:00.000Z',
        createdBy: 'user_1',
        updatedAt: '2026-03-11T10:00:00.000Z',
        updatedBy: 'user_1',
      },
      data: {
        id: 'data_1',
        projectId: 'project_1',
        label: 'Point note',
        description: 'Observed point',
        class: null,
        content: {},
        visibilityType: 'scene',
        visibilityId: 'scene_1',
        version: 0,
        erasableAt: null,
        erasableBy: null,
        createdAt: '2026-03-11T10:00:00.000Z',
        createdBy: 'user_1',
        updatedAt: '2026-03-11T10:00:00.000Z',
        updatedBy: 'user_1',
      },
      link: {
        id: 'link_1',
        projectId: 'project_1',
        geometryId: 'geom_1',
        dataId: 'data_1',
        version: 0,
        erasableAt: null,
        erasableBy: null,
        createdAt: '2026-03-11T10:00:00.000Z',
        createdBy: 'user_1',
        updatedAt: '2026-03-11T10:00:00.000Z',
        updatedBy: 'user_1',
      },
    };

    const parsed = resolvedAnnotationSchema.parse(payload);
    const resolved: ResolvedAnnotation = parsed;

    expect(resolved.link.geometryId).toBe(resolved.geometry.id);
    expectTypeOf(parsed).toEqualTypeOf<ResolvedAnnotation>();
  });
});