import { useEffect, useRef, useState } from 'react';
import {
  EUROPEANA_PAGE_SIZE,
  getEuropeanaRecordDetail,
  searchEuropeana,
  type EuropeanaRecordDetail,
  type EuropeanaSearchResult,
} from '../../services/EuropeanaApi';

export interface EuropeanaBrowserSelection {
  result: EuropeanaSearchResult;
  detail: EuropeanaRecordDetail | null;
}

interface EuropeanaBrowserProps {
  disabled?: boolean;
  onSelectionChange?: (selection: EuropeanaBrowserSelection | null) => void;
}

export default function EuropeanaBrowser({ disabled = false, onSelectionChange }: EuropeanaBrowserProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<EuropeanaSearchResult[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<EuropeanaSearchResult | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<EuropeanaRecordDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  async function handleSearch(): Promise<void> {
    if (!searchTerm.trim()) {
      return;
    }

    try {
      setSearchBusy(true);
      setSearchError(null);
      setResults([]);
      setHasMore(false);
      setSelected(null);
      setSelectedDetail(null);
      setDetailError(null);
      onSelectionChangeRef.current?.(null);

      const data = await searchEuropeana(searchTerm, 0);
      setResults(data);
      setOffset(EUROPEANA_PAGE_SIZE);
      setHasMore(data.length === EUROPEANA_PAGE_SIZE);
      if (data.length === 0) {
        setSearchError('No 3D Europeana results found.');
      }
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
      const data = await searchEuropeana(searchTerm, offset);
      setResults((prev) => [...prev, ...data]);
      setOffset((prev) => prev + EUROPEANA_PAGE_SIZE);
      setHasMore(data.length === EUROPEANA_PAGE_SIZE);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setMoreBusy(false);
    }
  }

  function handleSelect(result: EuropeanaSearchResult): void {
    setSelected(result);
    setSelectedDetail(null);
    setDetailError(null);
    onSelectionChangeRef.current?.({ result, detail: null });
  }

  useEffect(() => {
    if (!selected?.uri) {
      setSelectedDetail(null);
      setDetailError(null);
      setDetailBusy(false);
      return;
    }
    const selectedRecord = selected;

    let cancelled = false;

    async function loadDetail(): Promise<void> {
      try {
        setDetailBusy(true);
        setDetailError(null);
        const detail = await getEuropeanaRecordDetail(selectedRecord.uri);
        if (!cancelled) {
          setSelectedDetail(detail);
          onSelectionChangeRef.current?.({ result: selectedRecord, detail });
        }
      } catch (error) {
        if (!cancelled) {
          setSelectedDetail(null);
          setDetailError(error instanceof Error ? error.message : 'Failed to load record detail.');
          onSelectionChangeRef.current?.({ result: selectedRecord, detail: null });
        }
      } finally {
        if (!cancelled) {
          setDetailBusy(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-5">
        <div className="border rounded-3 p-3 h-100" style={{ background: 'linear-gradient(180deg,#f8fbff 0%,#fff 100%)' }}>
          <h6 className="fw-bold mb-3">Search Europeana 3D</h6>
          <div className="input-group mb-2">
            <input
              type="text"
              className="form-control"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Title or description keyword"
              disabled={searchBusy || disabled}
              onKeyDownCapture={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleSearch();
                }
              }}
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
              : 'Searches only Europeana items that expose a 3D .glb resource, matching title or description and preferring English labels when available.'}
          </div>

          {searchError && <div className="alert alert-warning py-2 small">{searchError}</div>}

          <div style={{ maxHeight: '420px', overflowY: 'auto' }} className="d-grid gap-2">
            {results.map((result) => {
              const isSelected = selected?.uri === result.uri;
              return (
                <button
                  key={result.uri}
                  type="button"
                  className={`btn text-start border ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => handleSelect(result)}
                  disabled={disabled}
                >
                  <div className="fw-semibold small text-break">{result.title || result.uri}</div>
                  {result.description && (
                    <div className={`small mt-1 ${isSelected ? 'text-white-50' : 'text-muted'}`}>
                      {result.description.length > 140 ? `${result.description.slice(0, 140)}…` : result.description}
                    </div>
                  )}
                  {result.license && (
                    <div className={`small mt-1 ${isSelected ? 'text-white-50' : 'text-muted'}`}>
                      License: {result.license}
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
                {moreBusy ? 'Loading…' : 'Load 20 more…'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="col-12 col-lg-7">
        <div className="border rounded-3 p-3 h-100" style={{ background: 'linear-gradient(180deg,#fffef7 0%,#fff 100%)' }}>
          <h6 className="fw-bold mb-3">Record Detail</h6>
          {!selected ? (
            <div className="alert alert-light border mb-0">
              Select a Europeana record from the list to preview it before importing.
            </div>
          ) : detailBusy ? (
            <div className="alert alert-light border mb-0">Loading record detail…</div>
          ) : detailError ? (
            <div className="alert alert-warning mb-0">{detailError}</div>
          ) : !selectedDetail ? (
            <div className="alert alert-light border mb-0">
              No detail available for the selected record.
            </div>
          ) : (
            <>
              {selectedDetail.thumbnailUrl && (
                <div className="text-center mb-3">
                  <img
                    src={selectedDetail.thumbnailUrl}
                    alt={selectedDetail.title || 'Europeana preview'}
                    style={{ maxHeight: '160px', maxWidth: '100%', objectFit: 'contain', borderRadius: '4px' }}
                  />
                </div>
              )}
              <dl className="row small mb-0">
                <dt className="col-sm-4">Title</dt>
                <dd className="col-sm-8 text-break">{selectedDetail.title || '—'}</dd>
                <dt className="col-sm-4">Identifier</dt>
                <dd className="col-sm-8 text-break">{selectedDetail.identifier || '—'}</dd>
                <dt className="col-sm-4">Creator</dt>
                <dd className="col-sm-8 text-break">{selectedDetail.creator || '—'}</dd>
                <dt className="col-sm-4">Date</dt>
                <dd className="col-sm-8">{selectedDetail.date || '—'}</dd>
                <dt className="col-sm-4">Coverage</dt>
                <dd className="col-sm-8 text-break">{selectedDetail.coverage || '—'}</dd>
                <dt className="col-sm-4">License</dt>
                <dd className="col-sm-8 text-break">{selectedDetail.license || '—'}</dd>
                <dt className="col-sm-4">3D media</dt>
                <dd className="col-sm-8 text-break">{selectedDetail.mediaUrl || '—'}</dd>
                <dt className="col-sm-4">Provider</dt>
                <dd className="col-sm-8 text-break">{selectedDetail.provider || '—'}</dd>
                <dt className="col-sm-4">Data provider</dt>
                <dd className="col-sm-8 text-break">{selectedDetail.dataProvider || '—'}</dd>
                <dt className="col-sm-4">Europeana URI</dt>
                <dd className="col-sm-8 text-break">
                  <a href={selectedDetail.uri} target="_blank" rel="noreferrer" className="small">
                    {selectedDetail.uri}
                  </a>
                </dd>
              </dl>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
