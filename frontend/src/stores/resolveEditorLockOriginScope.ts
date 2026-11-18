import type { AnnotationEventResourceType } from 'shared/annotation-events';
import type { AnnotationData, AnnotationGeometry, AnnotationLink } from 'shared/annotation-types';

export type EditorLockOriginScope = {
  originScopeType: 'scene' | 'asset';
  originScopeId: string;
};

type ScopeMaps = {
  getGeometry: (id: string) => AnnotationGeometry | undefined;
  getData: (id: string) => AnnotationData | undefined;
  getLink?: (id: string) => AnnotationLink | undefined;
};

/**
 * Origin scope for an editor social-lock announcement.
 * Asset-scoped entities fan out to every scene that contains that asset (backend impact).
 * Falls back to the current scene when the entity is missing from the local maps.
 */
export function resolveEditorLockOriginScope(
  resourceType: AnnotationEventResourceType,
  resourceId: string,
  sceneId: string,
  maps: ScopeMaps,
): EditorLockOriginScope {
  if (resourceType === 'geometry') {
    const geometry = maps.getGeometry(resourceId);
    if (geometry?.referenceType === 'asset' && geometry.referenceId) {
      return { originScopeType: 'asset', originScopeId: geometry.referenceId };
    }
    if (geometry?.referenceType === 'scene' && geometry.referenceId) {
      return { originScopeType: 'scene', originScopeId: geometry.referenceId };
    }
  }

  if (resourceType === 'data') {
    const datum = maps.getData(resourceId);
    if (datum?.visibilityType === 'asset' && datum.visibilityId) {
      return { originScopeType: 'asset', originScopeId: datum.visibilityId };
    }
    if (datum?.visibilityType === 'scene' && datum.visibilityId) {
      return { originScopeType: 'scene', originScopeId: datum.visibilityId };
    }
  }

  if (resourceType === 'link') {
    const link = maps.getLink?.(resourceId);
    if (link) {
      const fromGeometry = resolveEditorLockOriginScope('geometry', link.geometryId, sceneId, maps);
      if (maps.getGeometry(link.geometryId)) {
        return fromGeometry;
      }
      return resolveEditorLockOriginScope('data', link.dataId, sceneId, maps);
    }
  }

  return { originScopeType: 'scene', originScopeId: sceneId };
}
