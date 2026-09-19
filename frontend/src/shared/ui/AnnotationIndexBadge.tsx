import './AnnotationIndexBadge.css';

interface AnnotationIndexBadgeProps {
  kind: 'geometry' | 'data';
  number: number;
}

/** Presentation-only index shared by annotation candidate lists. */
export default function AnnotationIndexBadge({ kind, number }: AnnotationIndexBadgeProps) {
  return (
    <span className="annotation-index-badge" aria-label={`${kind} ${number}`}>
      {kind === 'geometry' ? 'G' : 'D'}{number}
    </span>
  );
}
