/** Stable, provider-neutral vocabulary types shared by the OCRA API and UI. */

export interface VocabularyConceptRef {
  uri: string;
  id: string;
  vocabulary: string;
  preferredLabel: string;
  language?: string;
}

export interface VocabularySearchResult extends VocabularyConceptRef {
  alternativeLabels?: string[];
  matchedLabel?: string;
  qualifier?: string;
  broaderLabel?: string;
  hierarchyContext?: string;
}

export interface VocabularySearchMatchOptions {
  wholeWords?: boolean;
  caseSensitive?: boolean;
}

export interface ExternalVocabularyConcept extends VocabularyConceptRef {
  alternativeLabels: string[];
  broader: VocabularyConceptRef[];
  scopeNote?: string;
  languages: string[];
}

export interface VocabularyProviderSummary {
  id: string;
  name: string;
  description: string;
  canonicalUriPrefix: string;
}

export interface VocabularySearchResponse {
  provider: VocabularyProviderSummary;
  query: string;
  language: string;
  offset?: number;
  results: VocabularySearchResult[];
}

export interface VocabularyConceptResponse {
  provider: VocabularyProviderSummary;
  concept: ExternalVocabularyConcept;
}
