import { useEffect, useState } from 'react';
import { ANNOTATION_COLOR_PRESETS, DEFAULT_ANNOTATION_COLOR, normalizeAnnotationHexColor } from 'shared/annotation-colors';
import type { AnnotationAppearance } from 'shared/annotation-types';

interface AnnotationColorPickerProps {
  value: AnnotationAppearance | null;
  onChange: (value: AnnotationAppearance | null) => void;
}

export default function AnnotationColorPicker({ value, onChange }: AnnotationColorPickerProps) {
  const selected = value?.color ?? null;
  const [customHex, setCustomHex] = useState(selected?.hex ?? DEFAULT_ANNOTATION_COLOR);
  const normalizedCustomHex = normalizeAnnotationHexColor(customHex);

  useEffect(() => {
    setCustomHex(selected?.hex ?? DEFAULT_ANNOTATION_COLOR);
  }, [selected?.hex]);

  const chooseCustom = (hex: string) => {
    const normalized = normalizeAnnotationHexColor(hex);
    setCustomHex(hex);
    if (normalized) onChange({ color: { hex: normalized } });
  };

  return (
    <div className="annotation-color-picker">
      <div className="d-flex flex-wrap gap-1" role="group" aria-label="Standard annotation colors">
        <button
          type="button"
          className={`btn btn-sm ${selected ? 'btn-outline-secondary' : 'btn-secondary'}`}
          aria-pressed={!selected}
          onClick={() => onChange(null)}
        >
          No color
        </button>
        {ANNOTATION_COLOR_PRESETS.map((preset) => {
          const active = selected?.presetId === preset.id;
          return (
            <button
              type="button"
              key={preset.id}
              className={`btn btn-sm d-inline-flex align-items-center gap-1 ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
              aria-pressed={active}
              title={`${preset.label} · ${preset.hex}`}
              onClick={() => onChange({ color: { hex: preset.hex, presetId: preset.id } })}
            >
              <span
                className="annotation-color-picker__swatch"
                style={{ backgroundColor: preset.hex }}
                aria-hidden
              />
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="input-group input-group-sm mt-2 annotation-color-picker__custom">
        <span className="input-group-text">Custom</span>
        <input
          type="color"
          className="form-control form-control-color"
          aria-label="Custom annotation color"
          value={normalizedCustomHex ?? DEFAULT_ANNOTATION_COLOR}
          onChange={(event) => chooseCustom(event.target.value)}
        />
        <input
          type="text"
          className={`form-control font-monospace ${normalizedCustomHex ? '' : 'is-invalid'}`}
          aria-label="Custom annotation color as hexadecimal value"
          value={customHex}
          maxLength={7}
          onChange={(event) => chooseCustom(event.target.value)}
          placeholder="#RRGGBB"
        />
      </div>
    </div>
  );
}
