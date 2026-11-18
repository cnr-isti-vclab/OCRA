import {
  formatAnnotationScopeLabel,
  type AnnotationScopeLabelAsset,
} from '../../utils/annotationScopeLabel';

/** Compact scene/asset scope badge for annotation list cards. */
export default function AnnotationScopeChip({
  type,
  id,
  sceneLabel,
  assets,
}: {
  type: 'scene' | 'asset';
  id: string;
  sceneLabel?: string;
  assets?: readonly AnnotationScopeLabelAsset[];
}) {
  const { text, title } = formatAnnotationScopeLabel({ type, id, sceneLabel, assets });
  return (
    <span className="badge text-bg-light border text-truncate" style={{ maxWidth: '12rem' }} title={title}>
      {text}
    </span>
  );
}
