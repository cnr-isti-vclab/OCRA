import { AnnotationApiError } from '../../services/AnnotationApiClient';
import type { AnnotationSocialLockState } from 'shared/annotation-events';

export type MessageModalTone = 'info' | 'success' | 'warning' | 'error';
export type MessageModalActionTone = 'primary' | 'secondary' | 'danger';

export interface MessageModalAction {
  key: string;
  label: string;
  tone?: MessageModalActionTone;
}

export class MessageModalDescriptor {
  readonly tone: MessageModalTone;
  readonly title: string;
  readonly message: string;
  readonly details: string[];
  readonly actions: MessageModalAction[];
  readonly dismissOnBackdrop: boolean;

  constructor(params: {
    tone: MessageModalTone;
    title: string;
    message: string;
    details?: string[];
    actions?: MessageModalAction[];
    closeLabel?: string;
    dismissOnBackdrop?: boolean;
  }) {
    this.tone = params.tone;
    this.title = params.title;
    this.message = params.message;
    this.details = params.details ?? [];
    this.actions = params.actions ?? [{ key: 'close', label: params.closeLabel ?? 'Close', tone: 'primary' }];
    this.dismissOnBackdrop = params.dismissOnBackdrop ?? true;
  }
}

export type AnnotationOperation =
  | 'update_data'
  | 'delete_data'
  | 'delete_data_bulk'
  | 'editor_lock_start'
  | 'editor_lock_stop';

function operationLabel(operation: AnnotationOperation): string {
  switch (operation) {
    case 'update_data':
      return 'update annotation data';
    case 'delete_data':
      return 'delete annotation data';
    case 'delete_data_bulk':
      return 'delete selected annotation data';
    case 'editor_lock_start':
      return 'start collaborative editing lock';
    case 'editor_lock_stop':
      return 'release collaborative editing lock';
  }
}

export class AnnotationMessageModalCatalog {
  static info(message: string, title = 'Information') {
    return new MessageModalDescriptor({
      tone: 'info',
      title,
      message,
    });
  }

  static success(message: string, title = 'Success') {
    return new MessageModalDescriptor({
      tone: 'success',
      title,
      message,
    });
  }

  static fromError(error: unknown, operation: AnnotationOperation): MessageModalDescriptor {
    const action = operationLabel(operation);

    if (error instanceof AnnotationApiError) {
      if (error.status === 409 && error.code === 'annotation.data.version_conflict') {
        return new MessageModalDescriptor({
          tone: 'warning',
          title: 'Version conflict (409)',
          message:
            'Another user saved a newer version while you were editing. Your changes were not applied. Please review the latest data and retry.',
        });
      }

      if (error.status === 409) {
        return new MessageModalDescriptor({
          tone: 'warning',
          title: 'Conflict (409)',
          message:
            'The operation conflicts with the current server state. Refresh data and retry.',
        });
      }

      if (error.status === 400) {
        return new MessageModalDescriptor({
          tone: 'error',
          title: 'Invalid request (400)',
          message:
            'The submitted data is not valid for this operation. Check the input and try again.',
        });
      }

      if (error.status === 401) {
        return new MessageModalDescriptor({
          tone: 'error',
          title: 'Authentication required (401)',
          message: 'Your session is not valid. Sign in again and retry.',
        });
      }

      if (error.status === 403) {
        return new MessageModalDescriptor({
          tone: 'error',
          title: 'Access denied (403)',
          message: 'You do not have permission to perform this action.',
        });
      }

      if (error.status === 404) {
        return new MessageModalDescriptor({
          tone: 'error',
          title: 'Resource not found (404)',
          message: 'The annotation was not found. It may have been removed or moved.',
        });
      }

      if (error.status >= 500) {
        return new MessageModalDescriptor({
          tone: 'error',
          title: 'Server error',
          message: 'The server failed to complete the request. Please try again shortly.',
        });
      }

      return new MessageModalDescriptor({
        tone: 'error',
        title: `Operation failed (${error.status})`,
        message: error.message || `Unable to ${action}.`,
      });
    }

    return new MessageModalDescriptor({
      tone: 'error',
      title: 'Unexpected error',
      message: `Unable to ${action}. Please try again.`,
    });
  }

  static lockConflict(locks: AnnotationSocialLockState[]): MessageModalDescriptor {
    const details = locks.slice(0, 5).map((lock) => {
      const resourceType = lock.resourceType ?? 'scope';
      const resourceId = lock.resourceId ?? 'project';
      const lockKind = lock.lockKind === 'editor' ? 'editor lock' : 'presence lock';
      return `${lock.username}: ${lockKind} on ${resourceType} ${resourceId}`;
    });

    if (locks.length > 5) {
      details.push(`+${locks.length - 5} more active lock(s).`);
    }

    return new MessageModalDescriptor({
      tone: 'warning',
      title: 'Annotation lock conflict',
      message:
        'This annotation is currently being edited by another user. Continuing may cause conflicts and could overwrite your changes.',
      details,
      actions: [
        { key: 'cancel', label: 'Cancel', tone: 'secondary' },
        { key: 'continue', label: 'Continue anyway', tone: 'danger' },
      ],
      dismissOnBackdrop: true,
    });
  }
}
