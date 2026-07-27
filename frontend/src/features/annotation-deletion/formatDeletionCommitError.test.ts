import { describe, expect, it } from 'vitest';
import { AnnotationApiError } from '../../services/AnnotationApiClient';
import { formatDeletionCommitError } from './formatDeletionCommitError';

describe('formatDeletionCommitError', () => {
  it('maps still_linked codes', () => {
    expect(formatDeletionCommitError(new AnnotationApiError(
      'still linked',
      409,
      'annotation.geometry.still_linked',
    ))).toMatch(/still linked outside/i);
    expect(formatDeletionCommitError(new AnnotationApiError(
      'still linked',
      409,
      'annotation.data.still_linked',
    ))).toMatch(/still linked outside/i);
  });

  it('maps already_erasable codes', () => {
    expect(formatDeletionCommitError(new AnnotationApiError(
      'already erasable',
      409,
      'annotation.link.already_erasable',
    ))).toMatch(/already deleted/i);
  });

  it('maps generic version conflicts', () => {
    expect(formatDeletionCommitError(new AnnotationApiError(
      'version conflict',
      409,
      'annotation.geometry.version_conflict',
    ))).toMatch(/version conflict/i);
  });

  it('maps server errors', () => {
    expect(formatDeletionCommitError(new AnnotationApiError('boom', 500))).toMatch(/server could not/i);
  });

  it('falls back to Error message', () => {
    expect(formatDeletionCommitError(new Error('Network down'))).toBe('Network down');
  });
});
