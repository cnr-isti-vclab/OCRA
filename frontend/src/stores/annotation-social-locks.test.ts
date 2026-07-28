import { describe, expect, it } from 'vitest';
import type { AnnotationSocialLockState } from 'shared/annotation-events';
import { isDataIdUnderEditorLock } from './annotation-social-locks';

function geometryEditorLock(geometryId: string): AnnotationSocialLockState {
  return {
    lockKind: 'editor',
    streamId: 'remote-stream',
    projectId: 'p1',
    sceneId: 's1',
    sessionId: 'sess-remote',
    userId: 'u2',
    username: 'remote',
    resourceType: 'geometry',
    resourceId: geometryId,
    activity: 'editing annotation geometry',
    startedAt: '2026-01-01T00:00:00.000Z',
    impact: { scope: 'resource' },
  };
}

describe('isDataIdUnderEditorLock', () => {
  it('ignores geometry editor locks when the data row is no longer actively linked', () => {
    const locks = [geometryEditorLock('g1')];
    const geometryIdsByDataId = new Map<string, string[]>();

    expect(
      isDataIdUnderEditorLock(
        'd1',
        locks,
        geometryIdsByDataId,
        [{ id: 'l1', dataId: 'd1', geometryId: 'g1' }],
      ),
    ).toBe(true);

    expect(
      isDataIdUnderEditorLock(
        'd1',
        locks,
        geometryIdsByDataId,
        [],
      ),
    ).toBe(false);
  });

  it('still marks linked data as under editing when an active link exists', () => {
    const locks = [geometryEditorLock('g1')];
    const geometryIdsByDataId = new Map<string, string[]>([['d1', ['g1']]]);

    expect(
      isDataIdUnderEditorLock(
        'd1',
        locks,
        geometryIdsByDataId,
        [{ id: 'l1', dataId: 'd1', geometryId: 'g1' }],
      ),
    ).toBe(true);
  });
});
