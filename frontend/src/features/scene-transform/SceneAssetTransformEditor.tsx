import { useState } from 'react';
import { formatScale, formatVector3, parseOptionalScale, parseOptionalVector3 } from '../../utils/vector';
import type { SceneSpatialMode } from './sceneSpatialMode';

export type SceneAssetTransformValue = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

type Props = {
  mode: SceneSpatialMode;
  value: SceneAssetTransformValue;
  onChange: (next: SceneAssetTransformValue) => void;
  disabled?: boolean;
};

function parseNumber(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Inline TRS editor for an asset in the HDT Edit Scene modal.
 * Remount with a `key` when the asset changes so local draft fields reset.
 */
export default function SceneAssetTransformEditor({ mode, value, onChange, disabled }: Props) {
  const position = value.position ?? [0, 0, 0];
  const rotation = value.rotation ?? [0, 0, 0];
  const scale = value.scale ?? 1;

  const [positionText, setPositionText] = useState(() => formatVector3(position));
  const [rotationText, setRotationText] = useState(() => formatVector3(rotation));
  const [scaleText, setScaleText] = useState(() => formatScale(scale));
  const [xText, setXText] = useState(() => String(position[0]));
  const [yText, setYText] = useState(() => String(position[1]));
  const [rotZText, setRotZText] = useState(() => String(rotation[2]));
  const [uniformScaleText, setUniformScaleText] = useState(
    () => String(typeof scale === 'number' ? scale : scale[0]),
  );
  const [error, setError] = useState<string | null>(null);

  const commit3d = (nextPos: string, nextRot: string, nextScale: string) => {
    try {
      const parsedPosition = parseOptionalVector3(nextPos, 'Position') ?? [0, 0, 0];
      const parsedRotation = parseOptionalVector3(nextRot, 'Rotation') ?? [0, 0, 0];
      const parsedScale = parseOptionalScale(nextScale) ?? 1;
      setError(null);
      onChange({ position: parsedPosition, rotation: parsedRotation, scale: parsedScale });
    } catch (err: any) {
      setError(err?.message || 'Invalid transform');
    }
  };

  const commit2d = (x: string, y: string, rotZ: string, uniform: string) => {
    onChange({
      position: [parseNumber(x, 0), parseNumber(y, 0), 0],
      rotation: [0, 0, parseNumber(rotZ, 0)],
      scale: parseNumber(uniform, 1),
    });
  };

  if (mode === '2D') {
    return (
      <div className="mt-2 ps-4 border-start">
        <div className="small text-muted mb-2">2D transform (XY translation, Z rotation °, uniform scale)</div>
        <div className="row g-2 align-items-center mb-1">
          <div className="col-3"><label className="form-label small mb-0">X</label></div>
          <div className="col-9">
            <input
              type="text"
              className="form-control form-control-sm"
              value={xText}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                setXText(v);
                commit2d(v, yText, rotZText, uniformScaleText);
              }}
            />
          </div>
        </div>
        <div className="row g-2 align-items-center mb-1">
          <div className="col-3"><label className="form-label small mb-0">Y</label></div>
          <div className="col-9">
            <input
              type="text"
              className="form-control form-control-sm"
              value={yText}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                setYText(v);
                commit2d(xText, v, rotZText, uniformScaleText);
              }}
            />
          </div>
        </div>
        <div className="row g-2 align-items-center mb-1">
          <div className="col-3"><label className="form-label small mb-0">Rot Z°</label></div>
          <div className="col-9">
            <input
              type="text"
              className="form-control form-control-sm"
              value={rotZText}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                setRotZText(v);
                commit2d(xText, yText, v, uniformScaleText);
              }}
            />
          </div>
        </div>
        <div className="row g-2 align-items-center mb-1">
          <div className="col-3"><label className="form-label small mb-0">Scale</label></div>
          <div className="col-9">
            <input
              type="text"
              className="form-control form-control-sm"
              value={uniformScaleText}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                setUniformScaleText(v);
                commit2d(xText, yText, rotZText, v);
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 ps-4 border-start">
      <div className="small text-muted mb-2">3D transform (position / rotation ° / scale)</div>
      <div className="row g-2 align-items-center mb-1">
        <div className="col-3"><label className="form-label small mb-0">Position</label></div>
        <div className="col-9">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="x, y, z"
            value={positionText}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setPositionText(v);
              commit3d(v, rotationText, scaleText);
            }}
          />
        </div>
      </div>
      <div className="row g-2 align-items-center mb-1">
        <div className="col-3"><label className="form-label small mb-0">Rotation</label></div>
        <div className="col-9">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="x, y, z"
            value={rotationText}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setRotationText(v);
              commit3d(positionText, v, scaleText);
            }}
          />
        </div>
      </div>
      <div className="row g-2 align-items-center mb-1">
        <div className="col-3"><label className="form-label small mb-0">Scale</label></div>
        <div className="col-9">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="1 or x, y, z"
            value={scaleText}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              setScaleText(v);
              commit3d(positionText, rotationText, v);
            }}
          />
        </div>
      </div>
      {error && <div className="text-danger small mt-1">{error}</div>}
    </div>
  );
}
