import { API_BASE } from '../config/oauth';

export interface EuropeanaSearchResult {
  uri: string;
  title: string | null;
  description: string | null;
  mediaUrl: string | null;
  license: string | null;
  provider: string | null;
  dataProvider: string | null;
  thumbnailUrl: string | null;
}

export interface EuropeanaRecordDetail extends EuropeanaSearchResult {
  creator: string | null;
  date: string | null;
  identifier: string | null;
  coverage: string | null;
  type: string | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const EUROPEANA_PAGE_SIZE = 20;

export async function searchEuropeana(q: string, offset = 0): Promise<EuropeanaSearchResult[]> {
  const data = await apiFetch<{ results: EuropeanaSearchResult[] }>(
    `/europeana/search?q=${encodeURIComponent(q)}&offset=${offset}`
  );
  return data.results;
}

export async function getEuropeanaRecordDetail(uri: string): Promise<EuropeanaRecordDetail> {
  const data = await apiFetch<{ detail: EuropeanaRecordDetail }>(
    `/europeana/detail?uri=${encodeURIComponent(uri)}`
  );
  return data.detail;
}
