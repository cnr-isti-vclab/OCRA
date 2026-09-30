import type {
  ExternalVocabularyConcept,
  VocabularyConceptRef,
  VocabularyProviderSummary,
  VocabularySearchResult,
} from 'shared/external-vocabulary';

export interface VocabularySearchOptions {
  language?: string;
  limit?: number;
}

export interface VocabularyConceptOptions {
  language?: string;
}

export interface VocabularyProvider {
  readonly metadata: VocabularyProviderSummary;

  search(query: string, options?: VocabularySearchOptions): Promise<VocabularySearchResult[]>;
  getConcept(uri: string, options?: VocabularyConceptOptions): Promise<ExternalVocabularyConcept>;
  getBroaderConcepts(uri: string, options?: VocabularyConceptOptions): Promise<VocabularyConceptRef[]>;
  getNarrowerConcepts(uri: string, options?: VocabularyConceptOptions): Promise<VocabularyConceptRef[]>;
  normalizeUri(value: string): string;
}

export class VocabularyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VocabularyInputError';
  }
}

export class VocabularyConceptNotFoundError extends Error {
  constructor(uri: string) {
    super(`Vocabulary concept not found: ${uri}`);
    this.name = 'VocabularyConceptNotFoundError';
  }
}

export class VocabularyProviderNotFoundError extends Error {
  constructor(providerId: string) {
    super(`Vocabulary provider not found: ${providerId}`);
    this.name = 'VocabularyProviderNotFoundError';
  }
}

export class VocabularyUpstreamError extends Error {
  constructor(message: string, readonly timedOut = false, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VocabularyUpstreamError';
  }
}
