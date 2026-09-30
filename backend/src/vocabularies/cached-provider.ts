import type {
  ExternalVocabularyConcept,
  VocabularyConceptRef,
  VocabularySearchResult,
} from 'shared/external-vocabulary';
import type { VocabularyCache } from './cache.js';
import type {
  VocabularyConceptOptions,
  VocabularyProvider,
  VocabularySearchOptions,
} from './types.js';

export interface CachedProviderOptions {
  searchTtlMs: number;
  conceptTtlMs: number;
}

function normalizedLanguage(language: string | undefined): string {
  return (language || 'en').trim().toLowerCase();
}

export class CachedVocabularyProvider implements VocabularyProvider {
  readonly metadata;

  constructor(
    private readonly provider: VocabularyProvider,
    private readonly cache: VocabularyCache,
    private readonly options: CachedProviderOptions,
  ) {
    this.metadata = provider.metadata;
  }

  normalizeUri(value: string): string {
    return this.provider.normalizeUri(value);
  }

  async search(query: string, options: VocabularySearchOptions = {}): Promise<VocabularySearchResult[]> {
    const normalizedQuery = query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const key = `${this.metadata.id}:search:${normalizedLanguage(options.language)}:${limit}:${offset}:${normalizedQuery}`;
    const cached = await this.cache.get<VocabularySearchResult[]>(key);
    if (cached) return cached;

    const results = await this.provider.search(query, options);
    await this.cache.set(key, results, this.options.searchTtlMs);
    return results;
  }

  async getConcept(uri: string, options: VocabularyConceptOptions = {}): Promise<ExternalVocabularyConcept> {
    const canonicalUri = this.normalizeUri(uri);
    const key = `${this.metadata.id}:concept:${normalizedLanguage(options.language)}:${canonicalUri}`;
    const cached = await this.cache.get<ExternalVocabularyConcept>(key);
    if (cached) return cached;

    const concept = await this.provider.getConcept(canonicalUri, options);
    await this.cache.set(key, concept, this.options.conceptTtlMs);
    return concept;
  }

  async getBroaderConcepts(uri: string, options: VocabularyConceptOptions = {}): Promise<VocabularyConceptRef[]> {
    return (await this.getConcept(uri, options)).broader;
  }

  async getNarrowerConcepts(uri: string, options: VocabularyConceptOptions = {}): Promise<VocabularyConceptRef[]> {
    const canonicalUri = this.normalizeUri(uri);
    const key = `${this.metadata.id}:narrower:${normalizedLanguage(options.language)}:${canonicalUri}`;
    const cached = await this.cache.get<VocabularyConceptRef[]>(key);
    if (cached) return cached;

    const concepts = await this.provider.getNarrowerConcepts(canonicalUri, options);
    await this.cache.set(key, concepts, this.options.conceptTtlMs);
    return concepts;
  }
}
