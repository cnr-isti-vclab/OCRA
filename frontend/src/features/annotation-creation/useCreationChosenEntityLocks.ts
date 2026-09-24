import { useEffect, useMemo, useRef } from 'react';
import type { AnnotationEventResourceType } from 'shared/annotation-events';
import type { AnnotationCreationDraft } from './types';

export interface CreationChosenEntityLock {
  resourceType: AnnotationEventResourceType;
  resourceId: string;
  activity: string;
}

/**
 * Keep editor social locks in sync with existing entities selected for linking
 * during the creation wizard (data Choose; geometries are owned by the viewers).
 */
export function useCreationChosenEntityLocks(
  draft: AnnotationCreationDraft | null | undefined,
  enabled: boolean,
  startEditorLock: (
    resourceType: AnnotationEventResourceType,
    resourceId: string,
    activity: string,
  ) => Promise<void>,
  stopEditorLock: (
    resourceType: AnnotationEventResourceType,
    resourceId: string,
    activity: string,
  ) => Promise<void>,
): void {
  const locksRef = useRef(new Map<string, CreationChosenEntityLock>());

  const desiredLocks = useMemo<CreationChosenEntityLock[]>(() => {
    if (!enabled || !draft) {
      return [];
    }
    if (draft.dataMode !== 'choose') {
      return [];
    }
    return draft.selectedDataIds.map((resourceId) => ({
      resourceType: 'data' as const,
      resourceId,
      activity: 'linking existing annotation data',
    }));
  }, [draft, enabled]);

  useEffect(() => {
    const next = new Map(
      desiredLocks.map((lock) => [`${lock.resourceType}:${lock.resourceId}`, lock]),
    );
    const previous = locksRef.current;
    const toStart = [...next].filter(([key]) => !previous.has(key)).map(([, lock]) => lock);
    const toStop = [...previous].filter(([key]) => !next.has(key)).map(([, lock]) => lock);
    locksRef.current = next;

    void Promise.all([
      ...toStart.map((lock) => startEditorLock(lock.resourceType, lock.resourceId, lock.activity)),
      ...toStop.map((lock) => stopEditorLock(lock.resourceType, lock.resourceId, lock.activity)),
    ]).catch((error: unknown) => {
      console.warn('Failed to synchronize creation linking locks:', error);
    });
  }, [desiredLocks, startEditorLock, stopEditorLock]);

  useEffect(() => () => {
    const locks = [...locksRef.current.values()];
    locksRef.current.clear();
    void Promise.all(locks.map((lock) => stopEditorLock(lock.resourceType, lock.resourceId, lock.activity)))
      .catch((error: unknown) => {
        console.warn('Failed to release creation linking locks:', error);
      });
  }, [stopEditorLock]);
}
