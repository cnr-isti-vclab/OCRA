import type { AnnotationGeometry, AnnotationShape } from 'shared/annotation-types';
import type {
  ViewerAnnotation,
  ViewerAnnotationGeometry,
  ViewerAnnotationShapeType,
} from 'shared/scene-types';
import {
  buildGeometryLabelDisplay,
  type ActiveAnnotationSelection,
} from '../../stores/annotation-selection';

function shapeToViewerType(shape: AnnotationShape): ViewerAnnotationShapeType {
  switch (shape.type) {
    case 'ShapePoints':
      return 'point';
    case 'ShapePolyline':
      return 'line';
    case 'ShapePolygon':
    default:
      return 'area';
  }
}

function shapeToViewerGeometry(shape: AnnotationShape): ViewerAnnotationGeometry {
  if (shape.type === 'ShapePoints') {
    return shape.vertices[0];
  }
  return shape.vertices;
}

/** Primary shape used when a geometry has multiple shapes (viewer renders one DTO per geometry). */
export function primaryShape(geometry: AnnotationGeometry): AnnotationShape {
  return geometry.shapes[0];
}

function pickDisplayLabel(
  geometryId: string,
  selection: ActiveAnnotationSelection,
  focusedDataIds: ReadonlySet<string>,
): string {
  const display = buildGeometryLabelDisplay(geometryId, selection, focusedDataIds);
  const selectedLabels = display.labels.filter((_, i) => display.selected[i]);
  if (selectedLabels.length > 0) {
    return selectedLabels.join(' | ');
  }
  if (display.labels.length > 0) {
    return display.labels.join(' | ');
  }
  return '(no data)';
}

function distinctLinkedClasses(
  dataIds: readonly string[],
  selection: ActiveAnnotationSelection,
): string[] {
  const classes = new Set<string>();
  for (const dataId of dataIds) {
    const classId = selection.dataById.get(dataId)?.class;
    if (classId) {
      classes.add(classId);
    }
  }
  return [...classes];
}

/**
 * Maps one active {@link AnnotationGeometry} to a viewer rendering DTO.
 * Geometry id is the viewer annotation id.
 */
export function geometryToViewerAnnotation(
  geometry: AnnotationGeometry,
  selection: ActiveAnnotationSelection,
  focusedDataIds: ReadonlySet<string> = new Set(),
  semanticClassPreference: readonly string[] = [],
): ViewerAnnotation {
  const shape = primaryShape(geometry);
  const dataIds = selection.dataIdsByGeometryId.get(geometry.id) ?? [];
  const primaryDataId = [...focusedDataIds].find((id) => dataIds.includes(id)) ?? dataIds[0];
  const datum = primaryDataId ? selection.dataById.get(primaryDataId) : undefined;
  const linkedClasses = distinctLinkedClasses(dataIds, selection);
  const semanticClass =
    semanticClassPreference.find((classId) =>
      dataIds.some((dataId) => selection.dataById.get(dataId)?.class === classId),
    ) ?? null;

  return {
    id: geometry.id,
    label: pickDisplayLabel(geometry.id, selection, focusedDataIds),
    semanticClass,
    strokeDasharray: semanticClass !== null && linkedClasses.length > 1 ? '8,6' : null,
    type: shapeToViewerType(shape),
    geometry: shapeToViewerGeometry(shape),
    description: datum?.description,
    createdAt: geometry.createdAt,
    createdBy: geometry.createdBy,
  };
}

export function activeGeometriesToViewerAnnotations(
  geometries: AnnotationGeometry[],
  selection: ActiveAnnotationSelection,
  focusedDataIds: ReadonlySet<string> = new Set(),
  semanticClassPreference: readonly string[] = [],
): ViewerAnnotation[] {
  return geometries.map((geometry) =>
    geometryToViewerAnnotation(geometry, selection, focusedDataIds, semanticClassPreference),
  );
}

/** Geometry ids to highlight in the viewer for the current data focus set. */
export function geometryIdsForFocusedData(
  dataIds: Iterable<string>,
  selection: ActiveAnnotationSelection,
): string[] {
  const out = new Set<string>();
  for (const dataId of dataIds) {
    for (const geometryId of selection.geometryIdsByDataId.get(dataId) ?? []) {
      out.add(geometryId);
    }
  }
  return [...out];
}

/** Data ids linked to any of the given geometry ids (deduplicated). */
export function dataIdsForFocusedGeometries(
  geometryIds: Iterable<string>,
  selection: ActiveAnnotationSelection,
): string[] {
  const out = new Set<string>();
  for (const geometryId of geometryIds) {
    for (const dataId of selection.dataIdsByGeometryId.get(geometryId) ?? []) {
      out.add(dataId);
    }
  }
  return [...out];
}

/**
 * Viewer highlight targets: geometry-led focus wins over panel data focus.
 * Panel multi-data → many geometries; viewer multi-geometry → those ids exactly.
 */
export function getViewerHighlightGeometryIds(
  focusedGeometryIds: ReadonlySet<string>,
  focusedDataIds: ReadonlySet<string>,
  selection: ActiveAnnotationSelection,
): string[] {
  if (focusedGeometryIds.size > 0) {
    return [...focusedGeometryIds];
  }
  return geometryIdsForFocusedData(focusedDataIds, selection);
}
