import { describe, expect, it } from 'vitest';
import { createLatestRequestTracker } from './ExternalVocabularyApi';

describe('createLatestRequestTracker', () => {
  it('rejects stale autocomplete responses after a newer request starts', () => {
    const tracker = createLatestRequestTracker();
    const oldRequest = tracker.begin();
    const currentRequest = tracker.begin();

    expect(tracker.isLatest(oldRequest)).toBe(false);
    expect(tracker.isLatest(currentRequest)).toBe(true);
  });
});
