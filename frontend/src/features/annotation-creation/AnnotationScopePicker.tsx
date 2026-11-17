import type { AnnotationScopeType } from 'shared/annotation-types';

export interface AnnotationScopePickerAsset {
  id: string;
  label: string;
}

interface AnnotationScopePickerProps {
  label: string;
  scopeType: AnnotationScopeType;
  scopeId: string;
  sceneId: string;
  assets: readonly AnnotationScopePickerAsset[];
  disabled?: boolean;
  onChange: (next: { type: AnnotationScopeType; id: string }) => void;
}

/**
 * Scene vs asset scope for geometry reference / data visibility.
 * Scene always uses the current scene id; asset uses the scene's assets
 * (auto-selected when there is only one).
 */
export default function AnnotationScopePicker({
  label,
  scopeType,
  scopeId,
  sceneId,
  assets,
  disabled = false,
  onChange,
}: AnnotationScopePickerProps) {
  const singleAsset = assets.length === 1 ? assets[0]! : null;

  return (
    <div className="border rounded p-2 bg-light-subtle" aria-label={label}>
      <div className="small fw-semibold mb-2">{label}</div>
      <div className="btn-group w-100 mb-2" role="group" aria-label={`${label} type`}>
        <button
          type="button"
          className={`btn btn-sm ${scopeType === 'scene' ? 'btn-secondary' : 'btn-outline-secondary'}`}
          aria-pressed={scopeType === 'scene'}
          disabled={disabled}
          onClick={() => onChange({ type: 'scene', id: sceneId })}
        >
          Scene
        </button>
        <button
          type="button"
          className={`btn btn-sm ${scopeType === 'asset' ? 'btn-secondary' : 'btn-outline-secondary'}`}
          aria-pressed={scopeType === 'asset'}
          disabled={disabled || assets.length === 0}
          title={assets.length === 0 ? 'No assets in this scene' : undefined}
          onClick={() => {
            const id = singleAsset?.id
              ?? (assets.some((asset) => asset.id === scopeId) ? scopeId : assets[0]?.id);
            if (!id) return;
            onChange({ type: 'asset', id });
          }}
        >
          Asset
        </button>
      </div>
      {scopeType === 'asset' ? (
        singleAsset ? (
          <p className="small text-muted mb-0">Asset: {singleAsset.label}</p>
        ) : (
          <select
            className="form-select form-select-sm"
            value={scopeId}
            disabled={disabled}
            aria-label={`${label} asset`}
            onChange={(event) => onChange({ type: 'asset', id: event.target.value })}
          >
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.label}</option>
            ))}
          </select>
        )
      ) : (
        <p className="small text-muted mb-0">Current scene</p>
      )}
    </div>
  );
}
