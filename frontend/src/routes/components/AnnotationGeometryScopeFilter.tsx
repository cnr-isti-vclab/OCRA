import type { GeometryScopeFilterValue } from '../../utils/geometryScopeFilter';
import {
  geometryScopeFilterFromValue,
  geometryScopeFilterToValue,
} from '../../utils/geometryScopeFilter';

export type GeometryScopeFilterAsset = {
  id: string;
  label: string;
};

/** Browse-only filter for painted geometries: All | Scene | per-asset. */
export default function AnnotationGeometryScopeFilter({
  value,
  sceneLabel,
  assets,
  disabled = false,
  onChange,
}: {
  value: GeometryScopeFilterValue;
  sceneLabel?: string;
  assets: readonly GeometryScopeFilterAsset[];
  disabled?: boolean;
  onChange: (next: GeometryScopeFilterValue) => void;
}) {
  return (
    <div className="mb-3">
      <label className="form-label small fw-semibold mb-1" htmlFor="annotation-geometry-scope-filter">
        Geometry scope
      </label>
      <select
        id="annotation-geometry-scope-filter"
        className="form-select form-select-sm"
        value={geometryScopeFilterToValue(value)}
        disabled={disabled}
        onChange={(event) => onChange(geometryScopeFilterFromValue(event.target.value))}
      >
        <option value="all">All</option>
        <option value="scene">{sceneLabel?.trim() || 'Scene'}</option>
        {assets.map((asset) => (
          <option key={asset.id} value={geometryScopeFilterToValue({ kind: 'asset', assetId: asset.id })}>
            {asset.label || asset.id}
          </option>
        ))}
      </select>
    </div>
  );
}
