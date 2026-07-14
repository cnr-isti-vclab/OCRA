import { describe, expect, it } from 'vitest';
import { AnnotationApiError } from '../../services/AnnotationApiClient';
import { formatCreationCommitError } from './formatCreationCommitError';

describe('formatCreationCommitError', () => {
  it('maps 409 conflicts to a refresh message', () => {
    expect(
      formatCreationCommitError(new AnnotationApiError('conflict', 409, 'annotation.data.version_conflict')),
    ).toContain('version conflict');
  });

  it('maps server errors to a retry message', () => {
    expect(formatCreationCommitError(new AnnotationApiError('boom', 500))).toContain('server');
  });

  it('uses API message for other client errors', () => {
    expect(formatCreationCommitError(new AnnotationApiError('Bad label', 400))).toBe('Bad label');
  });

  it('falls back for unknown errors', () => {
    expect(formatCreationCommitError(new Error('Network down'))).toBe('Network down');
    expect(formatCreationCommitError('oops')).toBe('Could not save the annotation.');
  });
});
