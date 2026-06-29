import { getApiBase } from '../config/oauth';
import type {
  VocabularyCatalog,
  VocabularyConcept,
} from '../types/vocabulary';

export async function fetchVocabularyCatalog(): Promise<VocabularyCatalog> {
  const response = await fetch(`${getApiBase()}/api/vocabulary/concepts`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to load vocabulary concepts (HTTP ${response.status})`);
  }

  const data = (await response.json()) as VocabularyCatalog;
  return {
    schemes: Array.isArray(data.schemes) ? data.schemes : [],
    concepts: Array.isArray(data.concepts) ? data.concepts : [],
    properties: Array.isArray(data.properties) ? data.properties : [],
  };
}

export async function fetchVocabularyConcepts(): Promise<VocabularyConcept[]> {
  const catalog = await fetchVocabularyCatalog();
  return catalog.concepts;
}
