import type { ReactNode } from 'react';

export default function AnnotationPanelBase({
  title = 'Annotations',
  subtitle,
  headerRight,
  status,
  classFilter,
  toggle,
  children,
}: {
  title?: string;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
  status?: ReactNode;
  classFilter?: ReactNode;
  toggle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-3 h-100 d-flex flex-column">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4 className="h4 mb-0">{title}</h4>
          {subtitle ? <div className="text-muted small">{subtitle}</div> : null}
        </div>
        {headerRight}
      </div>

      {status}
      {classFilter}
      {toggle}

      <div className="flex-grow-1 overflow-auto">{children}</div>
    </div>
  );
}

