import type { SceneSpatialMode } from './sceneSpatialMode';

export type SceneAssetTransformSummaryInput = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
};

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

function formatScale(scale: number | [number, number, number] | undefined): string {
  if (scale === undefined) return '1';
  if (typeof scale === 'number') return fmt(scale);
  if (scale[0] === scale[1] && scale[1] === scale[2]) return fmt(scale[0]);
  return `${fmt(scale[0])}, ${fmt(scale[1])}, ${fmt(scale[2])}`;
}

/**
 * Compact read-only TRS for scene cards.
 * 2D shows the planar subset; 3D shows full vectors (degrees for rotation).
 */
export function formatSceneAssetTransformSummary(
  transform: SceneAssetTransformSummaryInput | null | undefined,
  mode: SceneSpatialMode,
): string {
  const position = transform?.position ?? [0, 0, 0];
  const rotation = transform?.rotation ?? [0, 0, 0];
  const scaleText = formatScale(transform?.scale);

  if (mode === '2D') {
    return `Transform: t(${fmt(position[0])}, ${fmt(position[1])}) · rotZ ${fmt(rotation[2])}° · s ${scaleText}`;
  }

  return (
    `Transform: t(${fmt(position[0])}, ${fmt(position[1])}, ${fmt(position[2])})`
    + ` · r(${fmt(rotation[0])}, ${fmt(rotation[1])}, ${fmt(rotation[2])}°)`
    + ` · s ${scaleText}`
  );
}
