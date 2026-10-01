import { useEffect, useRef, useState } from 'react';
import type {
  ExternalVocabularyConcept,
  VocabularySearchResult,
} from 'shared/external-vocabulary';
import {
  createLatestRequestTracker,
  getExternalVocabularyConcept,
  searchExternalVocabulary,
} from '../../services/ExternalVocabularyApi';

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_PAGE_SIZE = 15;
const SEARCH_PROBE_SIZE = SEARCH_PAGE_SIZE + 1;

export default function AatVocabularyExplorer() {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('en');
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<VocabularySearchResult[]>([]);
  const [selected, setSelected] = useState<ExternalVocabularyConcept | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingConcept, setLoadingConcept] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestTracker = useRef(createLatestRequestTracker());

  useEffect(() => {
    const trimmedQuery = query.trim();
    const requestId = requestTracker.current.begin();
    setSelected(null);
    setError(null);
    setResults([]);

    if (trimmedQuery.length < 2) {
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void searchExternalVocabulary(
        'aat',
        trimmedQuery,
        language,
        SEARCH_PROBE_SIZE,
        controller.signal,
        page * SEARCH_PAGE_SIZE,
      )
        .then((nextResults) => {
          if (requestTracker.current.isLatest(requestId)) setResults(nextResults);
        })
        .catch((reason: unknown) => {
          if (
            requestTracker.current.isLatest(requestId)
            && !(reason instanceof DOMException && reason.name === 'AbortError')
          ) {
            setError(reason instanceof Error ? reason.message : String(reason));
            setResults([]);
          }
        })
        .finally(() => {
          if (requestTracker.current.isLatest(requestId)) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, language, page]);

  const visibleResults = results.slice(0, SEARCH_PAGE_SIZE);
  const hasNextPage = results.length > SEARCH_PAGE_SIZE;

  const selectConcept = async (result: VocabularySearchResult) => {
    const requestId = requestTracker.current.begin();
    setLoadingConcept(true);
    setError(null);
    try {
      const concept = await getExternalVocabularyConcept('aat', result.id, language);
      if (requestTracker.current.isLatest(requestId)) setSelected(concept);
    } catch (reason) {
      if (requestTracker.current.isLatest(requestId)) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (requestTracker.current.isLatest(requestId)) setLoadingConcept(false);
    }
  };

  return (
    <section className="card border-primary mb-4" aria-labelledby="aat-explorer-title">
      <div className="card-header bg-primary-subtle d-flex align-items-center gap-2">
        <span className="badge bg-primary">external vocabulary</span>
        <strong id="aat-explorer-title">Getty Art &amp; Architecture Thesaurus (AAT)</strong>
      </div>
      <div className="card-body">
        <p className="text-muted small">
          Experimental search area. It does not modify annotations. Getty's canonical URI is
          the authoritative identity of every result.
        </p>

        <div className="row g-2 align-items-end">
          <div className="col-md-9">
            <label htmlFor="aat-query" className="form-label">Search preferred and alternative terms</label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-search" /></span>
              <input
                id="aat-query"
                type="search"
                className="form-control"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder="e.g. oil paint, façade, 300015050"
                autoComplete="off"
              />
              {searching ? (
                <span className="input-group-text">
                  <span className="spinner-border spinner-border-sm" role="status" aria-label="Searching" />
                </span>
              ) : null}
            </div>
            <div className="form-text">Type at least 2 characters. Search starts after 400 ms.</div>
          </div>
          <div className="col-md-3">
            <label htmlFor="aat-language" className="form-label">Preferred language</label>
            <select
              id="aat-language"
              className="form-select"
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                setPage(0);
              }}
            >
              <option value="en">English</option>
              <option value="it">Italiano</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
              <option value="nl">Nederlands</option>
            </select>
          </div>
        </div>

        {error ? <div className="alert alert-warning py-2 mt-3 mb-0">{error}</div> : null}

        {query.trim().length >= 2 && !searching && !error && results.length === 0 ? (
          <p className="text-muted mt-3 mb-0">No AAT concepts found.</p>
        ) : null}

        {results.length > 0 ? (
          <div className="list-group mt-3">
            {visibleResults.map((result) => (
              <button
                type="button"
                key={result.uri}
                className={`list-group-item list-group-item-action ${selected?.uri === result.uri ? 'active' : ''}`}
                onClick={() => void selectConcept(result)}
              >
                <div className="d-flex justify-content-between gap-3">
                  <span className="fw-semibold">{result.preferredLabel}</span>
                  <small className="text-nowrap">{result.id}</small>
                </div>
                <div className={`small ${selected?.uri === result.uri ? '' : 'text-muted'}`}>
                  {result.broaderLabel || result.hierarchyContext || 'AAT concept'}
                  {result.matchedLabel ? ` · matched: ${result.matchedLabel}` : ''}
                </div>
              </button>
            ))}
          </div>
        ) : null}
        {results.length > 0 && (page > 0 || hasNextPage) ? (
          <nav className="d-flex align-items-center justify-content-between gap-3 mt-2" aria-label="AAT result pages">
            <span className="small text-muted">
              Results {page * SEARCH_PAGE_SIZE + 1}–{page * SEARCH_PAGE_SIZE + visibleResults.length}
              {' · '}page {page + 1}
            </span>
            <div className="btn-group btn-group-sm" role="group" aria-label="Result pagination">
              {page > 0 ? (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                >
                  <i className="bi bi-chevron-left me-1" aria-hidden />
                  Previous
                </button>
              ) : null}
              {hasNextPage ? (
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                >
                  Show more
                  <i className="bi bi-chevron-right ms-1" aria-hidden />
                </button>
              ) : null}
            </div>
          </nav>
        ) : null}

        {loadingConcept ? (
          <div className="d-flex align-items-center gap-2 text-muted mt-3">
            <span className="spinner-border spinner-border-sm" role="status" />
            Loading concept details…
          </div>
        ) : null}

        {selected ? (
          <div className="card bg-light mt-3">
            <div className="card-body">
              <h5 className="card-title">{selected.preferredLabel}</h5>
              <dl className="row small mb-0">
                <dt className="col-sm-3">Canonical URI</dt>
                <dd className="col-sm-9">
                  <a href={selected.uri} target="_blank" rel="noreferrer">{selected.uri}</a>
                </dd>
                <dt className="col-sm-3">Language</dt>
                <dd className="col-sm-9">{selected.language || 'not specified'}</dd>
                <dt className="col-sm-3">Alternative labels</dt>
                <dd className="col-sm-9">
                  {selected.alternativeLabels.length ? selected.alternativeLabels.join(', ') : '—'}
                </dd>
                <dt className="col-sm-3">Broader concept</dt>
                <dd className="col-sm-9">
                  {selected.broader.length
                    ? selected.broader.map((item) => `${item.preferredLabel} (${item.id})`).join(', ')
                    : '—'}
                </dd>
                <dt className="col-sm-3">Scope note</dt>
                <dd className="col-sm-9">{selected.scopeNote || '—'}</dd>
              </dl>
              <details className="mt-3">
                <summary className="small">Normalized API record</summary>
                <pre className="small bg-dark text-light rounded p-3 mt-2 mb-0 text-wrap">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
