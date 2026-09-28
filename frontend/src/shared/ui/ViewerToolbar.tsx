import type { MouseEvent } from 'react';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './ViewerToolbar.css';

export interface ViewerToolbarAction {
  id: string;
  title: string;
  active: boolean;
  enabled: boolean;
}

export interface ViewerToolbarProps {
  actions: ViewerToolbarAction[];
  label?: string;
  onAction: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
}

const ACTION_ICONS: Record<string, string> = {
  home: 'bi-house',
  fullscreen: 'bi-arrows-fullscreen',
  layers: 'bi-layers',
  light: 'bi-lightbulb',
  settings: 'bi-gear',
};

/** Renderer-neutral, application-owned toolbar for viewer actions. */
export default function ViewerToolbar({ actions, label = 'Viewer controls', onAction }: ViewerToolbarProps) {
  return (
    <aside className="ocra-viewer-toolbar" aria-label={label}>
      <div className="ocra-viewer-toolbar__actions" role="toolbar" aria-orientation="vertical">
        {actions.map((action) => (
          <button key={action.id} type="button" className="ocra-viewer-toolbar__button"
            aria-label={action.title} aria-pressed={action.active} title={action.title}
            disabled={!action.enabled} onClick={(event) => onAction(action.id, event)}>
            <span className={'bi ' + (ACTION_ICONS[action.id] ?? 'bi-circle')} aria-hidden="true" />
          </button>
        ))}
      </div>
    </aside>
  );
}
