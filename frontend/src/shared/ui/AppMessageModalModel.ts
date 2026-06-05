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

export class AppMessageModalCatalog {
  static info(message: string, title = 'Information', details?: string[]) {
    return new MessageModalDescriptor({
      tone: 'info',
      title,
      message,
      details,
    });
  }

  static success(message: string, title = 'Success', details?: string[]) {
    return new MessageModalDescriptor({
      tone: 'success',
      title,
      message,
      details,
    });
  }

  static warning(message: string, title = 'Warning', details?: string[]) {
    return new MessageModalDescriptor({
      tone: 'warning',
      title,
      message,
      details,
    });
  }

  static error(message: string, title = 'Error', details?: string[]) {
    return new MessageModalDescriptor({
      tone: 'error',
      title,
      message,
      details,
    });
  }
}
