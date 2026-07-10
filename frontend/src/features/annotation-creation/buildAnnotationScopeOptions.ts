import type { AnnotationScopeOption } from './types';

interface BuildScopeOptionsInput {
  sceneId: string;
  sceneLabel?: string;
  assets: Array<{ id: string; label: string }>;
}

export function buildAnnotationScopeOptions({
  sceneId,
  sceneLabel,
  assets,
}: BuildScopeOptionsInput): AnnotationScopeOption[] {
  const options: AnnotationScopeOption[] = [
    {
      type: 'scene',
      id: sceneId,
      label: sceneLabel ? `Scene: ${sceneLabel}` : `Scene: ${sceneId}`,
    },
  ];

  for (const asset of assets) {
    options.push({
      type: 'asset',
      id: asset.id,
      label: `Asset: ${asset.label}`,
    });
  }

  return options;
}
