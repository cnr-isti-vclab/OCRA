import { getApiBase } from '../config/oauth';

export interface VocabularyConcept {
  curie: string;
  prefLabelEn: string;
  prefLabelIt: string;
  color: string;
  broader: string | null;
}

interface VocabularyConceptsResponse {
  concepts: VocabularyConcept[];
}

export async function fetchVocabularyConcepts(): Promise<VocabularyConcept[]> {
  const response = await fetch(`${getApiBase()}/api/vocabulary/concepts`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to load vocabulary concepts (HTTP ${response.status})`);
  }

  const data = (await response.json()) as VocabularyConceptsResponse;
  return Array.isArray(data.concepts) ? data.concepts : [];
}
