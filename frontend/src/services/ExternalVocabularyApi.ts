import type {
  ExternalVocabularyConcept,
  VocabularyConceptResponse,
  VocabularySearchResponse,
  VocabularySearchResult,
} from 'shared/external-vocabulary';
import { getApiBase } from '../config/oauth';

const searchCache = new Map<string, VocabularySearchResult[]>();

async function responseError(response: Response): Promise<Error> {
  try {
    const payload = await response.json() as { error?: string };
    return new Error(payload.error || `Vocabulary request failed (HTTP ${response.status})`);
  } catch {
    return new Error(`Vocabulary request failed (HTTP ${response.status})`);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('The request was aborted', 'AbortError');
}

export async function searchExternalVocabulary(
  providerId: string,
  query: string,
  language = 'en',
  limit = 20,
  signal?: AbortSignal,
  offset = 0,
): Promise<VocabularySearchResult[]> {
  const key = `${providerId}:${language.toLowerCase()}:${limit}:${offset}:${query.normalize('NFKC').trim().toLowerCase()}`;
  const cached = searchCache.get(key);
  if (cached) {
    throwIfAborted(signal);
    return cached;
  }

  const url = new URL(`${getApiBase()}/api/vocabularies/${encodeURIComponent(providerId)}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('lang', language);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as VocabularySearchResponse;
  const results = Array.isArray(payload.results) ? payload.results : [];
  searchCache.set(key, results);
  return results;
}

export async function getExternalVocabularyConcept(
  providerId: string,
  conceptId: string,
  language = 'en',
  signal?: AbortSignal,
): Promise<ExternalVocabularyConcept> {
  const url = new URL(
    `${getApiBase()}/api/vocabularies/${encodeURIComponent(providerId)}/concepts/${encodeURIComponent(conceptId)}`,
  );
  url.searchParams.set('lang', language);
  const response = await fetch(url, { credentials: 'include', signal });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as VocabularyConceptResponse;
  return payload.concept;
}

export function createLatestRequestTracker() {
  let latestRequestId = 0;
  return {
    begin(): number {
      latestRequestId += 1;
      return latestRequestId;
    },
    isLatest(requestId: number): boolean {
      return requestId === latestRequestId;
    },
  };
}

export function clearExternalVocabularySearchCache(): void {
  searchCache.clear();
}
