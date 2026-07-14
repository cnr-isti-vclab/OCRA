import { AnnotationApiError } from '../../services/AnnotationApiClient';

export function formatCreationCommitError(err: unknown): string {
  if (err instanceof AnnotationApiError) {
    if (err.status === 409) {
      return 'A version conflict occurred while saving. Refresh and try again.';
    }
    if (err.status >= 500) {
      return 'The server could not save the annotation. Try again in a moment.';
    }
    const detail = err.message.trim();
    return detail.length > 0 ? detail : 'Could not save the annotation.';
  }

  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }

  return 'Could not save the annotation.';
}
