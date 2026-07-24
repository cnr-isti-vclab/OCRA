import { AnnotationApiError } from '../../services/AnnotationApiClient';

export function formatDeletionCommitError(err: unknown): string {
  if (err instanceof AnnotationApiError) {
    if (
      err.code === 'annotation.geometry.still_linked'
      || err.code === 'annotation.data.still_linked'
    ) {
      return 'This annotation is still linked outside the current scene (or outside the delete basket). Refresh, include the remaining links, or delete them first, then retry.';
    }
    if (
      err.code === 'annotation.geometry.already_erasable'
      || err.code === 'annotation.data.already_erasable'
      || err.code === 'annotation.link.already_erasable'
    ) {
      return 'An item was already deleted by someone else. Refresh and review the basket.';
    }
    if (err.status === 409) {
      return 'A version conflict occurred while deleting. Refresh and try again.';
    }
    if (err.status >= 500) {
      return 'The server could not complete the deletion. Try again in a moment.';
    }
    const detail = err.message.trim();
    return detail.length > 0 ? detail : 'Could not complete the deletion.';
  }

  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }

  return 'Could not complete the deletion.';
}
