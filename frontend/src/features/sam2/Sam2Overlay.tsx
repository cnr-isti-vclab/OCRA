import { useCallback, useState } from 'react';
import type { OpenLIMEViewerRef } from '../../adapters/openlime-viewer/OpenLIMEViewer';
import type { AnnotationShape } from '../../../../shared/annotation-types';
import type { SceneDescription } from '../../../../shared/scene-types';
import type { DigitalAsset } from '../../routes/HDTPage';
import { sam2Segment } from '../../services/Sam2ApiClient';
import {
  captureViewerCanvas,
  clientPointToImagePixel,
  containerPointToImagePixel,
  imagePixelToContainerPoint,
} from './openlimeCoords';
import { findSam2SourceImage } from './sam2ImageSource';

interface Sam2Point {
  containerX: number;
  containerY: number;
  pixelX: number;
  pixelY: number;
  // 1 = include, 0 = exclude
  label: number;
}

export interface Sam2OverlayProps {
  viewer: OpenLIMEViewerRef | null;
  sceneDesc: SceneDescription | null;
  digitalAssets: readonly DigitalAsset[];
  container: HTMLElement | null;
  onAccept: (shapes: AnnotationShape[]) => void;
}

export default function Sam2Overlay({ viewer, sceneDesc, digitalAssets, container, onAccept }: Sam2OverlayProps) {
  const [points, setPoints] = useState<Sam2Point[]>([]);
  const [polygon, setPolygon] = useState<Array<[number, number]> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPoints([]);
    setPolygon(null);
    setError(null);
  }, []);

  const runSegment = useCallback(
    async (nextPoints: ReadonlyArray<Sam2Point>) => {
      if (!viewer) return;

      setLoading(true);
      setError(null);

      try {
        const source = await findSam2SourceImage(sceneDesc, digitalAssets, () => captureViewerCanvas(container));

        const promptPoints = source.usedCanvasCapture
          ? nextPoints.map((p) => ({ x: p.containerX, y: p.containerY }))
          : nextPoints.map((p) => ({ x: p.pixelX, y: p.pixelY }));

        const result = await sam2Segment(
          source.blob,
          promptPoints,
          nextPoints.map((p) => p.label),
        );

        // AnnotationShape.vertices wants image-pixel coords
        let imagePixelPolygon: Array<[number, number]>;
        if (source.usedCanvasCapture) {
          const manager = viewer.getAnnotationManager();
          imagePixelPolygon = result.polygon
            .map(([cx, cy]) => containerPointToImagePixel(manager, container, cx, cy))
            .filter((p): p is { x: number; y: number } => p !== null)
            .map((p) => [p.x, p.y] as [number, number]);
        } else if (
          source.trueWidth != null &&
          source.trueHeight != null &&
          (result.width !== source.trueWidth || result.height !== source.trueHeight)
        ) {
          // deepzoom preview tile is downsampled, rescale to true size
          const scaleX = source.trueWidth / result.width;
          const scaleY = source.trueHeight / result.height;
          imagePixelPolygon = result.polygon.map(([px, py]) => [px * scaleX, py * scaleY]);
        } else {
          imagePixelPolygon = result.polygon;
        }

        setPolygon(imagePixelPolygon);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'SAM2 segment failed');
      } finally {
        setLoading(false);
      }
    },
    [viewer, sceneDesc, digitalAssets, container],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (loading || !viewer) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const containerX = e.clientX - rect.left;
      const containerY = e.clientY - rect.top;

      // use OpenLIME's own conversion so this matches its native vertex placement
      const pixel = clientPointToImagePixel(viewer.getAnnotationManager(), e.clientX, e.clientY);

      const newPoint: Sam2Point = {
        containerX,
        containerY,
        pixelX: pixel?.x ?? containerX,
        pixelY: pixel?.y ?? containerY,
        label: e.shiftKey ? 0 : 1,
      };

      const nextPoints = [...points, newPoint];
      setPoints(nextPoints);
      void runSegment(nextPoints);
    },
    [viewer, loading, points, runSegment],
  );

  const accept = useCallback(() => {
    if (!polygon || polygon.length < 3) return;
    onAccept([{ type: 'ShapePolygon', vertices: polygon.map(([px, py]) => [px, py, 0]) }]);
    reset();
  }, [polygon, onAccept, reset]);

  const pixelToContainer = (px: number, py: number) =>
    imagePixelToContainerPoint(viewer?.getAnnotationManager(), px, py) ?? { x: 0, y: 0 };

  return (
    <>
      <div
        style={{ position: 'absolute', inset: 0, cursor: loading ? 'wait' : 'crosshair', zIndex: 50 }}
        onClick={handleClick}
        title="Click to add positive point, Shift+click for negative point"
      >
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
        >
          {polygon && polygon.length >= 3 && (
            <path
              d={
                polygon
                  .map(([vx, vy]) => pixelToContainer(vx, vy))
                  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                  .join(' ') + ' Z'
              }
              fill="rgba(59, 130, 246, 0.25)"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="6 3"
            />
          )}

          {points.map((p, i) => {
            const converted = pixelToContainer(p.pixelX, p.pixelY);
            const c = converted.x === 0 && converted.y === 0 ? { x: p.containerX, y: p.containerY } : converted;
            return (
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

      <div
        style={{
          position: 'absolute',
          bottom: '60px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          pointerEvents: 'auto',
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(4px)',
          borderRadius: '8px',
          padding: '4px 8px',
        }}
      >
        {loading && <span style={{ color: '#93c5fd', fontSize: '13px' }}>Segmenting…</span>}
        {error && (
          <span style={{ color: '#f87171', fontSize: '13px' }} title={error}>
            Error: {error.slice(0, 60)}
          </span>
        )}
        {!loading && points.length > 0 && (
          <span style={{ color: '#d1d5db', fontSize: '13px' }}>
            {points.length} point{points.length !== 1 ? 's' : ''}
          </span>
        )}
        <button
          className="btn btn-sm btn-outline-light"
          disabled={loading}
          onClick={(e) => { e.stopPropagation(); reset(); }}
          title="Clear points and mask"
        >
          Reset
        </button>
        <button
          className="btn btn-sm btn-success"
          disabled={loading || !polygon || polygon.length < 3}
          onClick={(e) => { e.stopPropagation(); accept(); }}
          title="Create annotation from SAM2 mask"
        >
          Accept
        </button>
        {points.length === 0 && !loading && (
          <span style={{ color: '#9ca3af', fontSize: '12px', marginLeft: '4px' }}>Click image to segment</span>
        )}
      </div>
    </>
  );
}
