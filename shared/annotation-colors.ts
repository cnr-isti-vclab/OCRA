export const ANNOTATION_COLOR_PRESETS = [
  { id: 'ocra.standard/damage', label: 'Damage / loss', hex: '#D32F2F' },
  { id: 'ocra.standard/condition', label: 'Condition / alteration', hex: '#E67E22' },
  { id: 'ocra.standard/information', label: 'Information / observation', hex: '#1976D2' },
  { id: 'ocra.standard/intentional-action', label: 'Intentional action', hex: '#F9A825' },
  { id: 'ocra.standard/treatment', label: 'Conservation treatment', hex: '#388E3C' },
  { id: 'ocra.standard/material', label: 'Material / composition', hex: '#00897B' },
  { id: 'ocra.standard/decoration', label: 'Decoration / iconography', hex: '#7B1FA2' },
  { id: 'ocra.standard/analysis', label: 'Measurement / analysis', hex: '#00838F' },
  { id: 'ocra.standard/uncertain', label: 'Uncertain / to verify', hex: '#6C757D' },
] as const;

export const DEFAULT_ANNOTATION_COLOR = '#808080';

export function annotationColorStyleId(hex: string): string {
  return `ocra-color-${hex.slice(1).toLowerCase()}`;
}

export function normalizeAnnotationHexColor(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}
