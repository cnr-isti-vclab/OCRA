import type { VocabularyProviderSummary } from 'shared/external-vocabulary';
import { AatVocabularyProvider } from './aat/aat-provider.js';
import { InMemoryVocabularyCache } from './cache.js';
import { CachedVocabularyProvider } from './cached-provider.js';
import { GettySparqlClient } from './sparql-client.js';
import {
  VocabularyProviderNotFoundError,
  type VocabularyProvider,
} from './types.js';

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class VocabularyService {
  private readonly providers = new Map<string, VocabularyProvider>();

  register(provider: VocabularyProvider): void {
    this.providers.set(provider.metadata.id.toLowerCase(), provider);
  }

  listProviders(): VocabularyProviderSummary[] {
    return [...this.providers.values()].map((provider) => provider.metadata);
  }

  getProvider(providerId: string): VocabularyProvider {
    const provider = this.providers.get(providerId.trim().toLowerCase());
    if (!provider) throw new VocabularyProviderNotFoundError(providerId);
    return provider;
  }
}

export function createVocabularyService(): VocabularyService {
  const service = new VocabularyService();
  const cache = new InMemoryVocabularyCache();
  const aat = new AatVocabularyProvider(new GettySparqlClient({
    endpoint: process.env.AAT_SPARQL_ENDPOINT?.trim() || 'https://vocab.getty.edu/sparql.json',
    timeoutMs: positiveInteger(process.env.AAT_REQUEST_TIMEOUT_MS, 8_000),
  }));

  service.register(new CachedVocabularyProvider(aat, cache, {
    searchTtlMs: positiveInteger(process.env.VOCABULARY_SEARCH_CACHE_TTL_MS, 5 * 60_000),
    conceptTtlMs: positiveInteger(process.env.VOCABULARY_CONCEPT_CACHE_TTL_MS, 60 * 60_000),
  }));
  return service;
}

export const vocabularyService = createVocabularyService();
