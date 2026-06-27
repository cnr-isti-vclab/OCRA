import { useState } from 'react';
import { searchArco, ARCO_PAGE_SIZE, type ArcoSearchResult } from '../../services/ArcoApi';

export interface ArcoBrowserSelection {
  result: ArcoSearchResult;
}

interface ArcoBrowserProps {
  disabled?: boolean;
  onSelectionChange?: (selection: ArcoBrowserSelection | null) => void;
}

export default function ArcoBrowser({ disabled = false, onSelectionChange }: ArcoBrowserProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<ArcoSearchResult[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<ArcoSearchResult | null>(null);

  async function handleSearch(): Promise<void> {
    if (!searchTerm.trim()) return;
    try {
      setSearchBusy(true);
      setSearchError(null);
      setResults([]);
      setHasMore(false);
      setSelected(null);
      onSelectionChange?.(null);
      const data = await searchArco(searchTerm, 0);
      setResults(data);
      setOffset(ARCO_PAGE_SIZE);
      setHasMore(data.length === ARCO_PAGE_SIZE);
      if (data.length === 0) setSearchError('No results found.');
    } catch (err) {
      setResults([]);
      setHasMore(false);
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleLoadMore(): Promise<void> {
    try {
      setMoreBusy(true);
      const data = await searchArco(searchTerm, offset);
      setResults((prev) => [...prev, ...data]);
      setOffset((prev) => prev + ARCO_PAGE_SIZE);
      setHasMore(data.length === ARCO_PAGE_SIZE);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setMoreBusy(false);
    }
  }

  function handleSelect(result: ArcoSearchResult): void {
    setSelected(result);
    onSelectionChange?.({ result });
  }

  return (
    <div className="row g-3">
      {/* Left: search + list */}
      <div className="col-12 col-lg-5">
        <div className="border rounded-3 p-3 h-100" style={{ background: 'linear-gradient(180deg,#f8fbff 0%,#fff 100%)' }}>
          <h6 className="fw-bold mb-3">Search ArCo</h6>
          <div className="input-group mb-2">
            <input
              type="text"
              className="form-control"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Title, keyword or catalog ID (e.g. 0901078520)"
              disabled={searchBusy || disabled}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSearch(); } }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSearch()}
              disabled={searchBusy || disabled || !searchTerm.trim()}
            >
              {searchBusy ? 'Searching…' : 'Search'}
            </button>
          </div>
          <div className="small text-muted mb-2">
            {results.length > 0
              ? `${results.length} result${results.length === 1 ? '' : 's'}${hasMore ? ' — scroll for more' : ''}`
              : 'Enter a title fragment or the numeric catalog ID.'}
          </div>

          {searchError && <div className="alert alert-warning py-2 small">{searchError}</div>}

          <div style={{ maxHeight: '380px', overflowY: 'auto' }} className="d-grid gap-1">
            {results.map((r) => {
              const isSelected = selected?.uri === r.uri;
              return (
                <button
                  key={r.uri}
                  type="button"
                  className={`btn text-start border ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => handleSelect(r)}
                  disabled={disabled}
                >
                  <div className="fw-semibold small text-break">{r.title || r.uri}</div>
                  {r.identifier && (
                    <div className={`small ${isSelected ? 'text-white-50' : 'text-muted'}`}>
                      ID: {r.identifier}
                    </div>
                  )}
                  {r.coverage && (
                    <div className={`small ${isSelected ? 'text-white-50' : 'text-muted'}`}>
                      {r.coverage}
                    </div>
                  )}
                </button>
              );
            })}
            {hasMore && (
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm mt-1"
                onClick={() => void handleLoadMore()}
                disabled={moreBusy || disabled}
              >
                {moreBusy ? (
                  <><span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" /> Loading…</>
                ) : (
                  'Load 20 more…'
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: detail */}
      <div className="col-12 col-lg-7">
        <div className="border rounded-3 p-3 h-100" style={{ background: 'linear-gradient(180deg,#fffef7 0%,#fff 100%)' }}>
          <h6 className="fw-bold mb-3">Record Detail</h6>
          {!selected ? (
            <div className="alert alert-light border mb-0">
              Select a record from the list to preview it before importing.
            </div>
          ) : (
            <>
              {selected.depiction && (
                <div className="text-center mb-3">
                  <img
                    src={selected.depiction}
                    alt={selected.title || 'Record image'}
                    style={{ maxHeight: '160px', maxWidth: '100%', objectFit: 'contain', borderRadius: '4px' }}
                  />
                </div>
              )}
              <dl className="row small mb-0">
                <dt className="col-sm-4">Title</dt>
                <dd className="col-sm-8 text-break">{selected.title || '—'}</dd>
                <dt className="col-sm-4">Catalog ID</dt>
                <dd className="col-sm-8">{selected.identifier || '—'}</dd>
                <dt className="col-sm-4">Creator</dt>
                <dd className="col-sm-8 text-break">{selected.creator || '—'}</dd>
                <dt className="col-sm-4">Date</dt>
                <dd className="col-sm-8">{selected.date || '—'}</dd>
                <dt className="col-sm-4">Coverage</dt>
                <dd className="col-sm-8 text-break">{selected.coverage || '—'}</dd>
                <dt className="col-sm-4">ArCo URI</dt>
                <dd className="col-sm-8 text-break">
                  <a href={selected.uri} target="_blank" rel="noreferrer" className="small">{selected.uri}</a>
                </dd>
              </dl>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
