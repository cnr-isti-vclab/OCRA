import { API_BASE } from '../config/oauth';

export interface ArcoSearchResult {
  uri: string;
  title: string | null;
  identifier: string | null;
  creator: string | null;
  date: string | null;
  coverage: string | null;
  depiction: string | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const ARCO_PAGE_SIZE = 20;

export async function searchArco(q: string, offset = 0): Promise<ArcoSearchResult[]> {
  const data = await apiFetch<{ results: ArcoSearchResult[] }>(
    `/arco/search?q=${encodeURIComponent(q)}&offset=${offset}`
  );
  return data.results;
}
