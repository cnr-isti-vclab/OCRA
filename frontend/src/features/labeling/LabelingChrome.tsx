import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { AnnotationToolbarMode } from '../../components/AnnotationToolbar';
import type { OpenLimeLabelVisibility } from '../../adapters/annotation-store/openlimeAnnotationAdapter';
import type { OpenLIMEViewerRef } from '../../adapters/openlime-viewer/OpenLIMEViewer';
import { clientPointToImagePixel, imagePixelToContainerPoint } from '../sam2/openlimeCoords';
import './labeling.css';

/** 2D labeling tools: the shared annotation modes plus SAM2 and TagLab's "assign class". */
export type LabelingTool = AnnotationToolbarMode | 'sam2' | 'assign';

/** SAM2 and assign draw nothing themselves: OpenLIME just stays in its select/edit mode. */
export function toOpenLimeMode(tool: LabelingTool): AnnotationToolbarMode {
  return tool === 'sam2' || tool === 'assign' ? 'edit' : tool;
}

const TOOL_GROUPS: ReadonlyArray<ReadonlyArray<{ tool: LabelingTool; icon: string; title: string }>> = [
  [{ tool: 'edit', icon: 'bi-cursor', title: 'Select / edit region border' }],
  [
    { tool: 'point', icon: 'bi-record-circle', title: 'Place annotation point' },
    { tool: 'line', icon: 'bi-slash-lg', title: 'Draw line' },
    { tool: 'area', icon: 'bi-pentagon', title: 'Polygon segmentation' },
    { tool: 'sam2', icon: 'bi-magic', title: 'SAM2 - positive/negative clicks segmentation' },
  ],
  [{ tool: 'assign', icon: 'bi-paint-bucket', title: 'Assign class to region' }],
];

/** TagLab-style vertical tool column on the left of the viewer. */
export function LabelingToolStrip({
  tool,
  onToolChange,
  viewerControlsShown,
  onToggleViewerControls,
}: {
  tool: LabelingTool;
  onToolChange: (tool: LabelingTool) => void;
  viewerControlsShown: boolean;
  onToggleViewerControls: () => void;
}) {
  return (
    <div className="labeling labeling-tools" role="toolbar" aria-label="Labeling tools" aria-orientation="vertical">
      {TOOL_GROUPS.map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <hr />}
          {group.map(({ tool: t, icon, title }) => (
            <button
              key={t}
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={tool === t}
              // keep focus off the button so SPACE goes to the tool, not a re-click
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onToolChange(t)}
            >
              <i className={`bi ${icon}`} aria-hidden />
            </button>
          ))}
        </Fragment>
      ))}
      <hr />
      <button
        type="button"
        title="Viewer controls: home, layers, light, and the pencil to leave labeling"
        aria-label="Viewer controls"
        aria-pressed={viewerControlsShown}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleViewerControls}
      >
        <i className="bi bi-sliders" aria-hidden />
      </button>
    </div>
  );
}

export interface LabelingDisplay {
  /** 0-100, TagLab's fill transparency. */
  transparency: number;
  fill: boolean;
  boundaries: boolean;
}

/**
 * TagLab-style header: fill transparency, Fill/Boundaries/Labels toggles and
 * the zoom + cursor-in-image-pixel readout. The readout keeps its own state so
 * mouse moves don't re-render the whole viewer panel.
 */
export function LabelingHeader({
  display,
  onDisplayChange,
  labelVisibility,
  onLabelVisibilityChange,
  viewerBox,
  manager,
}: {
  display: LabelingDisplay;
  onDisplayChange: (display: LabelingDisplay) => void;
  labelVisibility: OpenLimeLabelVisibility;
  onLabelVisibilityChange: (mode: OpenLimeLabelVisibility) => void;
  viewerBox: HTMLElement | null;
  manager: ReturnType<OpenLIMEViewerRef['getAnnotationManager']>;
}) {
  const [zoom, setZoom] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!viewerBox || !manager) return;

    const onMove = (e: PointerEvent) => {
      const p = clientPointToImagePixel(manager, e.clientX, e.clientY);
      setCursor(p ? { x: Math.round(p.x), y: Math.round(p.y) } : null);
    };
    const onLeave = () => setCursor(null);
    // screen px per image px, measured over 1000 px to keep rounding out of it
    const onDraw = () => {
      const a = imagePixelToContainerPoint(manager, 0, 0);
      const b = imagePixelToContainerPoint(manager, 1000, 0);
      if (a && b) setZoom(Math.round(((b.x - a.x) / 1000) * 100));
    };

    // OpenLIME emits 'draw' after every camera change
    const viewer = (manager as unknown as { viewer?: { addEvent?: Function; removeEvent?: Function } }).viewer;
    viewer?.addEvent?.('draw', onDraw);
    onDraw();
    viewerBox.addEventListener('pointermove', onMove);
    viewerBox.addEventListener('pointerleave', onLeave);
    return () => {
      viewer?.removeEvent?.('draw', onDraw);
      viewerBox.removeEventListener('pointermove', onMove);
      viewerBox.removeEventListener('pointerleave', onLeave);
    };
  }, [viewerBox, manager]);

  return (
    <div className="labeling labeling-header">
      <label title="Transparency of the region fill">
        Transparency {display.transparency}%
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={display.transparency}
          disabled={!display.fill}
          onChange={(e) => onDisplayChange({ ...display, transparency: Number(e.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={display.fill}
          onChange={(e) => onDisplayChange({ ...display, fill: e.target.checked })}
        />
        Fill
      </label>
      <label>
        <input
          type="checkbox"
          checked={display.boundaries}
          onChange={(e) => onDisplayChange({ ...display, boundaries: e.target.checked })}
        />
        Boundaries
      </label>
      <label title="Show the label of every annotation, not only the selected ones">
        <input
          type="checkbox"
          checked={labelVisibility === 'all'}
          onChange={(e) => onLabelVisibilityChange(e.target.checked ? 'all' : 'selected')}
        />
        Labels
      </label>
      <div className="labeling-readout">
        <span>Zoom: {zoom ?? '–'}%</span>
        <span>x: {cursor?.x ?? '–'}</span>
        <span>y: {cursor?.y ?? '–'}</span>
      </div>
    </div>
  );
}

const TOOL_HELP: Record<Exclude<LabelingTool, 'sam2'>, { title: string; help: ReactNode }> = {
  edit: {
    title: 'Select and edit regions',
    help: <p>Click a region to select it, drag its vertices to edit the border.<br />Drag to pan, wheel to zoom.</p>,
  },
  point: {
    title: 'Place annotation points',
    help: <p>Click on the image to place a point.</p>,
  },
  line: {
    title: 'Draw a line',
    help: <p>Click to add vertices, double-click or <kbd>ENTER</kbd> to finish.<br /><kbd>ESC</kbd> to cancel.</p>,
  },
  area: {
    title: 'Segment a region by its outline',
    help: <p>Click to add vertices, double-click or <kbd>ENTER</kbd> to close the polygon.<br /><kbd>ESC</kbd> to cancel.</p>,
  },
  assign: {
    title: 'Assign the active class to regions',
    help: <p>Pick a class in the <b>Labels</b> panel, then click the regions to relabel.</p>,
  },
};

/**
 * TagLab's tool message panel, bottom-left of the viewer. Only the title shows
 * until it is clicked open; `children` (status, actions) always show.
 */
export function ToolMessagePanel({ title, help, children }: { title: string; help: ReactNode; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="labeling-message">
      <button type="button" className="labeling-message-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        <i className={`bi ${open ? 'bi-chevron-down' : 'bi-chevron-right'}`} aria-hidden /> {title}
      </button>
      {open && help}
      {children}
    </div>
  );
}

export function ToolHelpPanel({ tool, activeClassLabel }: { tool: Exclude<LabelingTool, 'sam2'>; activeClassLabel: string | null }) {
  const { title, help } = TOOL_HELP[tool];
  return (
    <ToolMessagePanel
      title={title}
      help={
        <>
          {help}
          {tool !== 'edit' && <p>Active class: <b>{activeClassLabel ?? 'none'}</b></p>}
        </>
      }
    />
  );
}
