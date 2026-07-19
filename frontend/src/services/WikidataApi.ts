import { API_BASE } from '../config/oauth';

export interface WikidataSearchResult {
  qid: string;
  uri: string;
  title: string | null;
  description: string | null;
}

export interface WikidataImageDetail {
  originalUrl: string;
  thumbnailUrl: string | null;
  filePageUrl: string;
  fileName: string;
  mimeType: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string | null;
}

export interface WikidataRecordDetail extends WikidataSearchResult {
  image: WikidataImageDetail | null;
}

export const WIKIDATA_PAGE_SIZE = 20;

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function searchWikidata(query: string, offset = 0, language = 'it'): Promise<WikidataSearchResult[]> {
  const data = await apiFetch<{ results: WikidataSearchResult[] }>(
    `/wikidata/search?q=${encodeURIComponent(query)}&offset=${offset}&language=${encodeURIComponent(language)}`,
  );
  return data.results;
}

export async function getWikidataRecordDetail(qid: string, language = 'it'): Promise<WikidataRecordDetail> {
  const data = await apiFetch<{ detail: WikidataRecordDetail }>(
    `/wikidata/detail?qid=${encodeURIComponent(qid)}&language=${encodeURIComponent(language)}`,
  );
  return data.detail;
}
