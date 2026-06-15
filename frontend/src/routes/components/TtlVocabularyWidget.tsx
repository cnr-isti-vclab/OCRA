/**
 * @spike feature/vocabulary-color-spike
 *
 * Self-contained widget that displays the TTL-based OCRA vocabulary in the
 * Vocabularies page.
 *
 * To remove this spike:
 *   1. Delete this file.
 *   2. Remove the <TtlVocabularyWidget /> usage from VocabularyList.tsx.
 *   3. Delete backend/src/lib/vocabulary-loader.ts and
 *      backend/src/routes/vocabulary-concepts.routes.ts.
 *   4. Remove the /vocabulary route mount from backend/src/routes/index.ts.
 */

import { useEffect, useState } from 'react';
import { getApiBase } from '../../config/oauth';

interface VocabularyConcept {
  curie: string;
  prefLabelEn: string;
  prefLabelIt: string;
  color: string;
  broader: string | null;
}

interface VocabularyScheme {
  curie: string;
  prefLabelEn: string;
  prefLabelIt: string;
  scopeNoteEn: string;
}

interface ConceptsResponse {
  scheme: VocabularyScheme;
  concepts: VocabularyConcept[];
}

function ColorDot({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        border: '1px solid rgba(0,0,0,0.15)',
        flexShrink: 0,
      }}
    />
  );
}

function ConceptTree({
  root,
  all,
  depth = 0,
}: {
  root: VocabularyConcept;
  all: VocabularyConcept[];
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const children = all.filter((c) => c.broader === root.curie);
  const hasChildren = children.length > 0;

  return (
    <div style={{ marginLeft: depth * 14 }}>
      <div
        className="d-flex align-items-center gap-2 py-1 rounded px-1"
        style={{ cursor: hasChildren ? 'pointer' : 'default', userSelect: 'none' }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        <ColorDot color={root.color} size={depth === 0 ? 14 : 11} />
        <span className={depth === 0 ? 'fw-semibold' : ''}>{root.prefLabelEn}</span>
        {root.prefLabelIt && (
          <span className="text-muted small fst-italic">({root.prefLabelIt})</span>
        )}
        {hasChildren && (
          <i
            className={`bi bi-chevron-${open ? 'up' : 'down'} ms-auto text-muted`}
            style={{ fontSize: '0.7rem' }}
          />
        )}
      </div>
      {open &&
        children.map((child) => (
          <ConceptTree key={child.curie} root={child} all={all} depth={depth + 1} />
        ))}
    </div>
  );
}

export default function TtlVocabularyWidget() {
  const [data, setData] = useState<ConceptsResponse | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${getApiBase()}/api/vocabulary/concepts`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((d: ConceptsResponse) => setData(d))
      .catch((err) => setError(String(err)));
  }, []);

  // Top-level concepts: those whose broader is null or not present among concepts
  const conceptCurieSet = new Set(data?.concepts.map((c) => c.curie) ?? []);
  const topConcepts =
    data?.concepts.filter((c) => !c.broader || !conceptCurieSet.has(c.broader)) ?? [];

  return (
    <div className="card border-warning mb-4">
      <div
        className="card-header d-flex align-items-center gap-2"
        style={{ backgroundColor: 'var(--bs-warning-bg-subtle, #fff8e1)' }}
      >
        <span className="badge bg-warning text-dark">spike</span>
        <strong className="flex-grow-1">
          {data ? data.scheme.prefLabelEn : 'TTL Vocabulary'}
          {data?.scheme.prefLabelIt && (
            <span className="text-muted fw-normal small ms-2 fst-italic">
              — {data.scheme.prefLabelIt}
            </span>
          )}
        </strong>
        {data && (
          <small className="text-muted me-1">{data.concepts.length} concepts</small>
        )}
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand vocabulary' : 'Collapse vocabulary'}
        >
          <i className={`bi bi-chevron-${collapsed ? 'down' : 'up'}`} />
        </button>
      </div>

      {!collapsed && (
        <div className="card-body">
          {error ? (
            <div className="alert alert-danger py-2 small mb-0">
              Could not load vocabulary: {error}
            </div>
          ) : !data ? (
            <div className="d-flex align-items-center gap-2 text-muted small">
              <div className="spinner-border spinner-border-sm" role="status" />
              Loading…
            </div>
          ) : (
            <>
              {data.scheme.scopeNoteEn && (
                <p className="text-muted small mb-3">{data.scheme.scopeNoteEn}</p>
              )}
              <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2">
                {topConcepts.map((top) => (
                  <div key={top.curie} className="col">
                    <div className="border rounded p-2 h-100">
                      <ConceptTree root={top} all={data.concepts} depth={0} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
