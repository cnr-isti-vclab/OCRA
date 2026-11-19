import { useEffect, useRef, useState } from 'react';
import type { OpenLIMEViewerRef } from '../../adapters/openlime-viewer/OpenLIMEViewer';
import type { AnnotationShape } from '../../../../shared/annotation-types';
import type { SceneDescription } from '../../../../shared/scene-types';
import type { DigitalAsset } from '../../routes/HDTPage';
import { rtiSegment } from '../../services/Sam2ApiClient';
import { clientPointToImagePixel, imagePixelToContainerPoint } from './openlimeCoords';
import { ToolMessagePanel } from '../labeling/LabelingChrome';

interface Sam2Point {
  pixelX: number;
  pixelY: number;
  // 1 = include, 0 = exclude
  label: number;
}

/** Folder URL of the scene's RTI asset, which rti-seg maps back onto the files it has mounted. */
function findRtiAssetBase(sceneDesc: SceneDescription | null, digitalAssets: readonly DigitalAsset[]): string | null {
  for (const model of sceneDesc?.models ?? []) {
    const asset = digitalAssets.find((a) => a.id === model.id);
    if (asset?.entryPointUrl != null && asset.type === 'rti') {
      const resolved = new URL(asset.entryPointUrl, window.location.href);
      resolved.search = '';
      resolved.hash = '';
      resolved.pathname = resolved.pathname.replace(/\/[^/]*$/, '/');
      return resolved.toString();
    }
  }
  return null;
}

export interface Sam2OverlayProps {
  viewer: OpenLIMEViewerRef | null;
  sceneDesc: SceneDescription | null;
  digitalAssets: readonly DigitalAsset[];
  onAccept: (shapes: AnnotationShape[]) => void;
  /** Class new regions get; tints the preview and is shown in the message panel. */
  activeClass?: { label: string; color: string } | null;
}

/**
 * SAM2 positive/negative clicks over the 2D viewer. Points accumulate and an
 * explicit run segments the RTI from its relit renderings (rti-seg), which
 * takes seconds, so the user says when to spend it.
 */
export default function Sam2Overlay({ viewer, sceneDesc, digitalAssets, onAccept, activeClass }: Sam2OverlayProps) {
  const [points, setPoints] = useState<Sam2Point[]>([]);
  const [polygon, setPolygon] = useState<Array<[number, number]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manager = viewer?.getAnnotationManager() ?? null;
  const assetUrl = findRtiAssetBase(sceneDesc, digitalAssets);

  const reset = () => {
    setPoints([]);
    setPolygon(null);
    setError(null);
  };

  /** The whole point set goes every time, so adding a point and re-running refines the shape. */
  const segment = async () => {
    if (!assetUrl || busy || points.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setPolygon(
        await rtiSegment(
          assetUrl,
          points.map((p) => ({ x: p.pixelX, y: p.pixelY })),
          points.map((p) => p.label),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relit segmentation failed');
    } finally {
      setBusy(false);
    }
  };

  const addPoint = (e: React.MouseEvent<HTMLDivElement>, label: number) => {
    e.preventDefault();
    if (busy) return;
    // use OpenLIME's own conversion so this matches its native vertex placement
    const pixel = clientPointToImagePixel(manager, e.clientX, e.clientY);
    if (pixel) setPoints([...points, { pixelX: pixel.x, pixelY: pixel.y, label }]);
  };

  const undo = () => {
    if (!busy) setPoints(points.slice(0, -1));
  };

  const accept = () => {
    if (busy || !polygon || polygon.length < 3) return;
    onAccept([{ type: 'ShapePolygon', vertices: polygon.map(([px, py]) => [px, py, 0]) }]);
    reset();
  };

  // TagLab keys: SPACE runs the segmentation, then confirms it; CTRL+Z drops the
  // last point; ESC starts over. The ref keeps the listener on the latest state
  // without re-subscribing on every render.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e) => {
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (polygon) accept();
      else void segment();
    } else if (e.key === 'Escape') {
      if (!busy) reset();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toContainer = (px: number, py: number) => imagePixelToContainerPoint(manager, px, py);
  const previewColor = activeClass?.color ?? '#3b82f6';

  return (
    <>
      <div
        style={{ position: 'absolute', inset: 0, cursor: busy ? 'wait' : 'crosshair', zIndex: 50 }}
        onClick={(e) => addPoint(e, 1)}
        onContextMenu={(e) => addPoint(e, 0)}
        title="Click to include, right-click to exclude"
      >
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
        >
          {polygon && polygon.length >= 3 && (
            <path
              d={
                polygon
                  .map(([vx, vy]) => toContainer(vx, vy) ?? { x: 0, y: 0 })
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                  .join(' ') + ' Z'
              }
              fill={previewColor}
              fillOpacity={0.3}
              stroke={previewColor}
              strokeWidth="2"
              strokeDasharray="6 3"
            />
          )}

          {points.map((p, i) => {
            const c = toContainer(p.pixelX, p.pixelY);
            return c && (
              <g key={i}>
                <circle cx={c.x} cy={c.y} r={7} fill={p.label === 1 ? '#22c55e' : '#ef4444'} stroke="white" strokeWidth={2} />
                <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">
                  {p.label === 1 ? '+' : '−'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <ToolMessagePanel
        title="Segment with positive/negative clicks"
        help={
          <>
            <p>
              - Click to add a point inside the object (positive)<br />
              - Right-click to add a point outside the object (negative)<br />
              - <kbd>CTRL</kbd>+<kbd>Z</kbd> to remove the last point, <kbd>ESC</kbd> to clear
            </p>
            <p>
              <kbd>SPACE</kbd> to segment, <kbd>SPACE</kbd> again to confirm
            </p>
            <p>Active class: <b>{activeClass?.label ?? 'none'}</b></p>
          </>
        }
      >
        {busy && <p className="labeling-status">Segmenting…</p>}
        {error && <p className="labeling-error" title={error}>Error: {error.slice(0, 80)}</p>}
        {!busy && points.length > 0 && <p>{points.length} point{points.length !== 1 ? 's' : ''}</p>}

        <div className="labeling-actions">
          <button
            className="btn btn-sm btn-outline-warning"
            disabled={busy || points.length === 0}
            onClick={() => void segment()}
            title="Segment from the points (SPACE)"
          >
            Segment
          </button>
          <button className="btn btn-sm btn-outline-light" disabled={busy} onClick={reset} title="Clear points and mask (ESC)">
            Reset
          </button>
          <button
            className="btn btn-sm btn-success"
            disabled={busy || !polygon || polygon.length < 3}
            onClick={accept}
            title="Create annotation from SAM2 mask (SPACE)"
          >
            Accept
          </button>
        </div>
      </ToolMessagePanel>
    </>
  );
}
