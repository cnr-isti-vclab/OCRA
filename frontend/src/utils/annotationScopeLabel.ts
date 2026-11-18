export type AnnotationScopeLabelAsset = {
  id: string;
  label: string;
};

/** Human-readable scope chip text; full id stays in `title` for hover. */
export function formatAnnotationScopeLabel(args: {
  type: 'scene' | 'asset';
  id: string;
  sceneLabel?: string;
  assets?: readonly AnnotationScopeLabelAsset[];
}): { text: string; title: string } {
  if (args.type === 'scene') {
    const text = args.sceneLabel?.trim() || 'Scene';
    return { text, title: `Scene · ${args.id}` };
  }
  const assetLabel = args.assets?.find((asset) => asset.id === args.id)?.label?.trim();
  const text = assetLabel || args.id;
  return { text, title: `Asset · ${args.id}` };
}
