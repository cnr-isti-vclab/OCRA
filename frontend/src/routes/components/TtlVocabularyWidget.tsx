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

import React, { useEffect, useMemo, useState } from 'react';
import { fetchVocabularyCatalog } from '../../services/VocabularyConceptApi';
import type { VocabularyCatalog } from '../../types/vocabulary';
import VocabularyTree from '../../shared/ui/VocabularyTree';
import { getVocabularySchemeLabel } from '../../utils/vocabulary';

export default function TtlVocabularyWidget() {
  const [data, setData] = useState<VocabularyCatalog | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurie, setSelectedCurie] = useState<string | null>(null);
  const [selectedPropertyCurie, setSelectedPropertyCurie] = useState<string | null>(null);

  useEffect(() => {
    void fetchVocabularyCatalog()
      .then((catalog) => {
        setData(catalog);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const selectedConcept = useMemo(
    () => data?.concepts.find((concept) => concept.curie === selectedCurie) ?? null,
    [data?.concepts, selectedCurie],
  );
  const selectedProperty = useMemo(
    () => data?.properties.find((property) => property.curie === selectedPropertyCurie) ?? null,
    [data?.properties, selectedPropertyCurie],
  );

  return (
    <div className="card border-warning mb-4">
      <div
        className="card-header d-flex align-items-center gap-2"
        style={{ backgroundColor: 'var(--bs-warning-bg-subtle, #fff8e1)' }}
      >
        <span className="badge bg-warning text-dark">spike</span>
        <strong className="flex-grow-1">
          {data?.schemes[0] ? getVocabularySchemeLabel(data.schemes[0]) : 'TTL Vocabulary'}
        </strong>
        {data ? (
          <small className="text-muted me-1">
            {data.concepts.length} concepts, {data.properties.length} properties
          </small>
        ) : null}
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setCollapsed((current) => !current)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand vocabulary' : 'Collapse vocabulary'}
        >
          <i className={`bi bi-chevron-${collapsed ? 'down' : 'up'}`} />
        </button>
      </div>

      {!collapsed ? (
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
              <h6 className="mb-2">Properties</h6>
              <div style={{ maxHeight: '26rem', overflowY: 'auto' }}>
                <VocabularyTree
                  schemes={data.schemes}
                  nodes={data.properties}
                  selectedNodeId={selectedProperty?.id ?? null}
                  onSelect={(node) => setSelectedPropertyCurie(node.curie)}
                />
              </div>

              <hr className="my-3" />
              <h6 className="mb-2">Concepts</h6>
              <div style={{ maxHeight: '30rem', overflowY: 'auto' }}>
                <VocabularyTree
                  schemes={data.schemes}
                  nodes={data.concepts}
                  selectedNodeId={selectedConcept?.id ?? null}
                  onSelect={(node) => setSelectedCurie(node.curie)}
                />
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
