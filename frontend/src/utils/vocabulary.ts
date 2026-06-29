import type {
  VocabularyConcept,
  VocabularyLocalizedValues,
  VocabularyProperty,
  VocabularyScheme,
} from '../types/vocabulary';

export type VocabularyTreeNode = VocabularyConcept | VocabularyProperty;

export interface VocabularySearchMatch {
  nodeId: string;
  score: number;
}

const DEFAULT_LANGUAGE_PRIORITY = ['en', 'it', 'und'];

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function getLocalizedValue(
  values: VocabularyLocalizedValues,
  preferredLanguages: readonly string[],
): string {
  for (const language of preferredLanguages) {
    const localizedValue = values[language];
    if (localizedValue?.trim()) {
      return localizedValue.trim();
    }
  }

  const firstValue = Object.values(values).find((value) => value.trim().length > 0);
  return firstValue?.trim() ?? '';
}

export function getVocabularyNodeLabel(
  node: Pick<VocabularyTreeNode, 'lemma' | 'prefLabels'>,
  preferredLanguages: readonly string[] = DEFAULT_LANGUAGE_PRIORITY,
): string {
  return getLocalizedValue(node.prefLabels, preferredLanguages) || node.lemma;
}

export function getVocabularyNodeScopeNote(
  node: Pick<VocabularyTreeNode, 'scopeNotes'>,
  preferredLanguages: readonly string[] = DEFAULT_LANGUAGE_PRIORITY,
): string {
  return getLocalizedValue(node.scopeNotes, preferredLanguages);
}

export function getVocabularySchemeLabel(
  scheme: Pick<VocabularyScheme, 'lemma' | 'prefLabels'>,
  preferredLanguages: readonly string[] = DEFAULT_LANGUAGE_PRIORITY,
): string {
  return getLocalizedValue(scheme.prefLabels, preferredLanguages) || scheme.lemma;
}

function getNodeSearchHaystack(node: VocabularyTreeNode): string[] {
  return [
    node.curie,
    node.lemma,
    ...Object.values(node.prefLabels),
    ...Object.values(node.scopeNotes),
  ]
    .map(normalizeSearchText)
    .filter((value) => value.length > 0);
}

function scoreSearchMatch(node: VocabularyTreeNode, query: string): number {
  const normalizedLemma = normalizeSearchText(node.lemma);
  const normalizedCurie = normalizeSearchText(node.curie);

  if (normalizedLemma.includes(query)) {
    return 300;
  }
  if (normalizedCurie.includes(query)) {
    return 250;
  }

  const prefLabelMatch = Object.values(node.prefLabels)
    .map(normalizeSearchText)
    .find((value) => value.includes(query));
  if (prefLabelMatch) {
    return 200;
  }

  const scopeNoteMatch = Object.values(node.scopeNotes)
    .map(normalizeSearchText)
    .find((value) => value.includes(query));
  if (scopeNoteMatch) {
    return 100;
  }

  return 0;
}

export function searchVocabularyNodes(
  nodes: readonly VocabularyTreeNode[],
  rawQuery: string,
): VocabularySearchMatch[] {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 4) {
    return [];
  }

  return nodes
    .map((node) => ({
      nodeId: node.id,
      score: scoreSearchMatch(node, query),
      label: getVocabularyNodeLabel(node),
      haystack: getNodeSearchHaystack(node),
    }))
    .filter((match) => match.score > 0 && match.haystack.some((entry) => entry.includes(query)))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.label.localeCompare(right.label);
    })
    .map(({ nodeId, score }) => ({ nodeId, score }));
}

export function collectVocabularyAncestorIds(
  nodeId: string,
  parentIdByNodeId: ReadonlyMap<string, string | null>,
): Set<string> {
  const ancestorIds = new Set<string>();
  let currentParentId = parentIdByNodeId.get(nodeId) ?? null;

  while (currentParentId) {
    ancestorIds.add(currentParentId);
    currentParentId = parentIdByNodeId.get(currentParentId) ?? null;
  }

  return ancestorIds;
}
