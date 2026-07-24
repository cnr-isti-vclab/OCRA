import { useEffect, useRef, useState } from 'react';
import {
  WIKIDATA_PAGE_SIZE,
  getWikidataRecordDetail,
  searchWikidata,
  type WikidataRecordDetail,
  type WikidataSearchResult,
} from '../../services/WikidataApi';

export interface WikidataBrowserSelection {
  result: WikidataSearchResult;
  detail: WikidataRecordDetail | null;
}

interface WikidataBrowserProps {
  disabled?: boolean;
  language?: string;
  onSelectionChange?: (selection: WikidataBrowserSelection | null) => void;
}

export default function WikidataBrowser({ disabled = false, language = 'it', onSelectionChange }: WikidataBrowserProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<WikidataSearchResult[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<WikidataSearchResult | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<WikidataRecordDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  async function handleSearch(): Promise<void> {
    if (!searchTerm.trim()) return;
    try {
      setSearchBusy(true);
      setSearchError(null);
      setResults([]);
      setHasMore(false);
      setSelected(null);
      setSelectedDetail(null);
      setDetailError(null);
      onSelectionChangeRef.current?.(null);
      const data = await searchWikidata(searchTerm, 0, language);
      setResults(data);
      setOffset(WIKIDATA_PAGE_SIZE);
      setHasMore(data.length === WIKIDATA_PAGE_SIZE);
      if (data.length === 0) setSearchError('No results found.');
    } catch (error) {
      setResults([]);
      setHasMore(false);
      setSearchError(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      setSearchBusy(false);
    }
  }

  async function handleLoadMore(): Promise<void> {
    try {
      setMoreBusy(true);
      const data = await searchWikidata(searchTerm, offset, language);
      setResults((previous) => [...previous, ...data]);
      setOffset((previous) => previous + WIKIDATA_PAGE_SIZE);
      setHasMore(data.length === WIKIDATA_PAGE_SIZE);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      setMoreBusy(false);
    }
  }

  function handleSelect(result: WikidataSearchResult): void {
    setSelected(result);
    setSelectedDetail(null);
    setDetailError(null);
    onSelectionChangeRef.current?.({ result, detail: null });
  }

  useEffect(() => {
    if (!selected) {
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
        const detail = await getWikidataRecordDetail(selectedRecord.qid, language);
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
        if (!cancelled) setDetailBusy(false);
      }
    }
    void loadDetail();
    return () => { cancelled = true; };
  }, [selected, language]);

  return (
    <div className="row g-3">
      <div className="col-12 col-lg-5">
        <div className="border rounded-3 p-3 h-100" style={{ background: 'linear-gradient(180deg,#f8fbff 0%,#fff 100%)' }}>
          <h6 className="fw-bold mb-3">Search Wikidata</h6>
          <form className="input-group mb-2" onSubmit={(event) => { event.preventDefault(); void handleSearch(); }}>
            <input type="text" className="form-control" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Name, title or QID (e.g. Q220)" disabled={searchBusy || disabled} />
            <button type="submit" className="btn btn-primary" disabled={searchBusy || disabled || !searchTerm.trim()}>{searchBusy ? 'Searching…' : 'Search'}</button>
          </form>
          <div className="small text-muted mb-2">
            {results.length > 0 ? `${results.length} result${results.length === 1 ? '' : 's'}${hasMore ? ' — scroll for more' : ''}` : 'Search Wikidata entities by title, keyword or QID.'}
          </div>
          {searchError && <div className="alert alert-warning py-2 small">{searchError}</div>}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }} className="d-grid gap-1">
            {results.map((result) => {
              const isSelected = selected?.qid === result.qid;
              return <button key={result.qid} type="button" className={`btn text-start border ${isSelected ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => handleSelect(result)} disabled={disabled}>
                <div className="fw-semibold small text-break">{result.title || result.qid}</div>
                <div className={`small ${isSelected ? 'text-white-50' : 'text-muted'}`}>{result.qid}</div>
                {result.description && <div className={`small mt-1 ${isSelected ? 'text-white-50' : 'text-muted'}`}>{result.description}</div>}
              </button>;
            })}
            {hasMore && <button type="button" className="btn btn-outline-secondary btn-sm mt-1" onClick={() => void handleLoadMore()} disabled={moreBusy || disabled}>{moreBusy ? 'Loading…' : 'Load 20 more…'}</button>}
          </div>
        </div>
      </div>
      <div className="col-12 col-lg-7">
        <div className="border rounded-3 p-3 h-100" style={{ background: 'linear-gradient(180deg,#fffef7 0%,#fff 100%)' }}>
          <h6 className="fw-bold mb-3">Record Detail</h6>
          {!selected ? <div className="alert alert-light border mb-0">Select a record from the list to preview it before importing.</div>
            : detailBusy ? <div className="alert alert-light border mb-0">Loading record detail…</div>
              : detailError ? <div className="alert alert-warning mb-0">{detailError}</div>
                : !selectedDetail ? <div className="alert alert-light border mb-0">No detail available for the selected record.</div>
                  : <>
                    {selectedDetail.image?.thumbnailUrl && <div className="text-center mb-3"><img src={selectedDetail.image.thumbnailUrl} alt={selectedDetail.title || 'Wikidata preview'} style={{ maxHeight: '180px', maxWidth: '100%', objectFit: 'contain', borderRadius: '4px' }} /></div>}
                    <dl className="row small mb-0">
                      <dt className="col-sm-4">Title</dt><dd className="col-sm-8 text-break">{selectedDetail.title || '—'}</dd>
                      <dt className="col-sm-4">QID</dt><dd className="col-sm-8">{selectedDetail.qid}</dd>
                      <dt className="col-sm-4">Description</dt><dd className="col-sm-8 text-break">{selectedDetail.description || '—'}</dd>
                      <dt className="col-sm-4">Image license</dt><dd className="col-sm-8 text-break">{selectedDetail.image?.license || 'No license metadata available'}</dd>
                      <dt className="col-sm-4">Wikidata URI</dt><dd className="col-sm-8 text-break"><a href={selectedDetail.uri} target="_blank" rel="noreferrer" className="small">{selectedDetail.uri}</a></dd>
                    </dl>
                  </>}
        </div>
      </div>
    </div>
  );
}
