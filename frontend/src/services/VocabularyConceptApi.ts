import { getApiBase } from '../config/oauth';

export interface VocabularyConcept {
  curie: string;
  prefLabelEn: string;
  color: string;
  broader: string | null;
  scopeNoteEn: string;
}

interface VocabularyProperty {
  curie: string;
  prefLabelEn: string;
  color: string;
  subPropertyOf: string | null;
  scopeNoteEn: string;
}

interface VocabularyConceptsResponse {
  concepts: VocabularyConcept[];
  properties?: VocabularyProperty[];
}

export async function fetchVocabularyConcepts(): Promise<VocabularyConcept[]> {
  const response = await fetch(`${getApiBase()}/api/vocabulary/concepts`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to load vocabulary concepts (HTTP ${response.status})`);
  }

  const data = (await response.json()) as VocabularyConceptsResponse;
  const concepts = Array.isArray(data.concepts) ? data.concepts : [];
  const properties = Array.isArray(data.properties)
    ? data.properties.map((property) => ({
        curie: property.curie,
        prefLabelEn: property.prefLabelEn,
        color: property.color,
        broader: property.subPropertyOf,
        scopeNoteEn: property.scopeNoteEn,
      }))
    : [];

  return [...concepts, ...properties];
}
