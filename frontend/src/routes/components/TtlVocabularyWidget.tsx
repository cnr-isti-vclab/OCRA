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
  color: string;
  broader: string | null;
  scopeNoteEn: string;
}

interface VocabularyProperty {
  curie: string;
  prefLabelEn: string;
  color: string;
  subPropertyOf: string | null;
  scopeNoteEn: string;
}

interface VocabularyScheme {
  curie: string;
  prefLabelEn: string;
  scopeNoteEn: string;
}

interface ConceptsResponse {
  scheme: VocabularyScheme;
  concepts: VocabularyConcept[];
  properties: VocabularyProperty[];
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
  selectedCurie,
  onSelect,
  depth = 0,
}: {
  root: VocabularyConcept;
  all: VocabularyConcept[];
  selectedCurie: string | null;
  onSelect: (concept: VocabularyConcept) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const children = all.filter((c) => c.broader === root.curie);
  const hasChildren = children.length > 0;
  const isSelected = selectedCurie === root.curie;

  return (
    <div style={{ marginLeft: depth * 14 }}>
      <div
        className="d-flex align-items-center gap-2 py-1 rounded px-1"
        style={{ userSelect: 'none' }}
        title={root.curie}
      >
        <ColorDot color={root.color} size={depth === 0 ? 14 : 11} />
        <button
          type="button"
          className={`btn btn-link p-0 text-start text-decoration-none ${depth === 0 ? 'fw-semibold' : ''}`}
          onClick={() => onSelect(root)}
          title={root.curie}
          style={{ color: 'inherit' }}
        >
          {root.prefLabelEn}
        </button>
        {hasChildren && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary ms-auto py-0 px-1"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${root.prefLabelEn}` : `Expand ${root.prefLabelEn}`}
          >
            <i
              className={`bi bi-chevron-${open ? 'up' : 'down'} text-muted`}
              style={{ fontSize: '0.7rem' }}
            />
          </button>
        )}
      </div>
      {isSelected && (
        <div className="mt-1 mb-2 ms-4 small border-start ps-2 text-muted">
          <div><strong>{root.prefLabelEn}</strong></div>
          <div><code>{root.curie}</code></div>
          {root.scopeNoteEn && <div>{root.scopeNoteEn}</div>}
        </div>
      )}
      {open &&
        children.map((child) => (
          <ConceptTree
            key={child.curie}
            root={child}
            all={all}
            selectedCurie={selectedCurie}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export default function TtlVocabularyWidget() {
  const [data, setData] = useState<ConceptsResponse | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurie, setSelectedCurie] = useState<string | null>(null);
  const [selectedPropertyCurie, setSelectedPropertyCurie] = useState<string | null>(null);

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

  const propertyCurieSet = new Set(data?.properties.map((p) => p.curie) ?? []);
  const topProperties =
    data?.properties.filter((p) => !p.subPropertyOf || !propertyCurieSet.has(p.subPropertyOf)) ?? [];

  function renderPropertyTree(root: VocabularyProperty, depth = 0): JSX.Element {
    const children = data?.properties.filter((p) => p.subPropertyOf === root.curie) ?? [];
    const isSelected = selectedPropertyCurie === root.curie;

    return (
      <div key={root.curie} style={{ marginLeft: depth * 14 }}>
        <div
          className="d-flex align-items-center gap-2 py-1 rounded px-1"
          style={{ userSelect: 'none' }}
          title={root.curie}
        >
          <ColorDot color={root.color} size={depth === 0 ? 14 : 11} />
          <button
            type="button"
            className={`btn btn-link p-0 text-start text-decoration-none ${depth === 0 ? 'fw-semibold' : ''}`}
            onClick={() =>
              setSelectedPropertyCurie((current) => (current === root.curie ? null : root.curie))
            }
            title={root.curie}
            style={{ color: 'inherit' }}
          >
            {root.prefLabelEn}
          </button>
        </div>
        {isSelected && (
          <div className="mt-1 mb-2 ms-4 small border-start ps-2 text-muted">
            <div><strong>{root.prefLabelEn}</strong></div>
            <div><code>{root.curie}</code></div>
            {root.scopeNoteEn && <div>{root.scopeNoteEn}</div>}
          </div>
        )}
        {children.map((child) => renderPropertyTree(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="card border-warning mb-4">
      <div
        className="card-header d-flex align-items-center gap-2"
        style={{ backgroundColor: 'var(--bs-warning-bg-subtle, #fff8e1)' }}
      >
        <span className="badge bg-warning text-dark">spike</span>
        <strong className="flex-grow-1">{data ? data.scheme.prefLabelEn : 'TTL Vocabulary'}</strong>
        {data && (
          <small className="text-muted me-1">
            {data.concepts.length} concepts, {data.properties.length} properties
          </small>
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
              <h6 className="mb-2">Properties</h6>
              <div className="row row-cols-1 row-cols-md-2 g-2">
                {topProperties.map((top) => (
                  <div key={top.curie} className="col">
                    <div className="border rounded p-2 h-100">{renderPropertyTree(top)}</div>
                  </div>
                ))}
              </div>

              <hr className="my-3" />
              <h6 className="mb-2">Concepts</h6>
              <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-2">
                {topConcepts.map((top) => (
                  <div key={top.curie} className="col">
                    <div className="border rounded p-2 h-100">
                      <ConceptTree
                        root={top}
                        all={data.concepts}
                        selectedCurie={selectedCurie}
                        onSelect={(concept) =>
                          setSelectedCurie((current) => (current === concept.curie ? null : concept.curie))
                        }
                        depth={0}
                      />
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
