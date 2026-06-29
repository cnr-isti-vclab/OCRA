export type VocabularyLocalizedValues = Record<string, string>;

export interface VocabularyScheme {
  id: string;
  curie: string;
  lemma: string;
  prefLabels: VocabularyLocalizedValues;
  scopeNotes: VocabularyLocalizedValues;
}

export interface VocabularyNodeBase {
  id: string;
  curie: string;
  lemma: string;
  schemeId: string;
  prefLabels: VocabularyLocalizedValues;
  scopeNotes: VocabularyLocalizedValues;
  color: string;
}

export interface VocabularyConcept extends VocabularyNodeBase {
  broader: string | null;
}

export interface VocabularyProperty extends VocabularyNodeBase {
  subPropertyOf: string | null;
}

export interface VocabularyCatalog {
  schemes: VocabularyScheme[];
  concepts: VocabularyConcept[];
  properties: VocabularyProperty[];
}
