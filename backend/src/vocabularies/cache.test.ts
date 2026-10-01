import { describe, expect, it, vi } from 'vitest';
import type {
  ExternalVocabularyConcept,
  VocabularyConceptRef,
  VocabularySearchResult,
} from 'shared/external-vocabulary';
import { CachedVocabularyProvider } from './cached-provider.js';
import { InMemoryVocabularyCache } from './cache.js';
import type {
  VocabularyConceptOptions,
  VocabularyProvider,
  VocabularySearchOptions,
} from './types.js';

class FakeProvider implements VocabularyProvider {
  readonly metadata = {
    id: 'fake',
    name: 'Fake',
    description: 'Test provider',
    canonicalUriPrefix: 'https://example.test/',
  };
  searchCalls = 0;
  conceptCalls = 0;

  normalizeUri(value: string): string {
    return value.startsWith('http') ? value : `https://example.test/${value}`;
  }

  async search(_query: string, _options?: VocabularySearchOptions): Promise<VocabularySearchResult[]> {
    this.searchCalls += 1;
    return [{
      uri: 'https://example.test/1',
      id: '1',
      vocabulary: 'FAKE',
      preferredLabel: 'One',
    }];
  }

  async getConcept(uri: string, _options?: VocabularyConceptOptions): Promise<ExternalVocabularyConcept> {
    this.conceptCalls += 1;
    return {
      uri: this.normalizeUri(uri),
      id: '1',
      vocabulary: 'FAKE',
      preferredLabel: 'One',
      alternativeLabels: [],
      broader: [],
      languages: ['en'],
    };
  }

  async getBroaderConcepts(): Promise<VocabularyConceptRef[]> {
    return [];
  }

  async getNarrowerConcepts(): Promise<VocabularyConceptRef[]> {
    return [];
  }
}

describe('CachedVocabularyProvider', () => {
  it('caches normalized repeated searches independently from concept records', async () => {
    const provider = new FakeProvider();
    const cached = new CachedVocabularyProvider(provider, new InMemoryVocabularyCache(), {
      searchTtlMs: 10_000,
      conceptTtlMs: 10_000,
    });

    await cached.search(' Oil   Paint ', { language: 'EN', limit: 10 });
    await cached.search('oil paint', { language: 'en', limit: 10 });
    await cached.search('oil paint', { language: 'en', limit: 10, offset: 10 });
    await cached.search('oil paint', { language: 'en', limit: 10, offset: 10 });
    await cached.getConcept('1', { language: 'en' });
    await cached.getConcept('https://example.test/1', { language: 'en' });

    expect(provider.searchCalls).toBe(2);
    expect(provider.conceptCalls).toBe(1);
  });

  it('keeps match modes in separate search cache entries', async () => {
    const provider = new FakeProvider();
    const cached = new CachedVocabularyProvider(provider, new InMemoryVocabularyCache(), {
      searchTtlMs: 10_000,
      conceptTtlMs: 10_000,
    });

    await cached.search('oil', { wholeWords: false, caseSensitive: false });
    await cached.search('oil', { wholeWords: true, caseSensitive: false });
    await cached.search('oil', { wholeWords: false, caseSensitive: true });
    await cached.search('Oil', { wholeWords: false, caseSensitive: true });
    await cached.search('Oil', { wholeWords: false, caseSensitive: false });

    expect(provider.searchCalls).toBe(4);
  });

  it('expires cache entries at their configured TTL', async () => {
    let now = 100;
    const provider = new FakeProvider();
    const cached = new CachedVocabularyProvider(
      provider,
      new InMemoryVocabularyCache(() => now),
      { searchTtlMs: 10, conceptTtlMs: 10 },
    );

    await cached.search('test');
    now = 111;
    await cached.search('test');

    expect(provider.searchCalls).toBe(2);
  });
});

describe('remote failure handling', () => {
  it('keeps failures out of the cache', async () => {
    const provider = new FakeProvider();
    vi.spyOn(provider, 'search').mockRejectedValueOnce(new Error('upstream down'));
    const cached = new CachedVocabularyProvider(provider, new InMemoryVocabularyCache(), {
      searchTtlMs: 10_000,
      conceptTtlMs: 10_000,
    });

    await expect(cached.search('test')).rejects.toThrow('upstream down');
    await expect(cached.search('test')).resolves.toHaveLength(1);
  });
});
