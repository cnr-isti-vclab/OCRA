import { useEffect, useMemo, useRef, useState } from 'react';
import type { VocabularyConcept, VocabularyScheme } from '../../types/vocabulary';
import VocabularyTree from './VocabularyTree';
import {
  getVocabularyNodeLabel,
  searchVocabularyNodes,
} from '../../utils/vocabulary';

const SEARCH_MIN_LENGTH = 4;

interface VocabularyClassPickerProps {
  inputId: string;
  value: string;
  onChange: (value: string) => void;
  schemes: readonly VocabularyScheme[];
  concepts: readonly VocabularyConcept[];
  placeholder?: string;
}

export default function VocabularyClassPicker({
  inputId,
  value,
  onChange,
  schemes,
  concepts,
  placeholder = 'Optional classification',
}: VocabularyClassPickerProps) {
  const trimmedValue = value.trim();
  const [isTreeOpen, setIsTreeOpen] = useState(false);
  const previousValueRef = useRef(value);

  const selectedConcept = useMemo(
    () => concepts.find((concept) => concept.curie === trimmedValue) ?? null,
    [concepts, trimmedValue],
  );

  const searchMatches = useMemo(
    () => searchVocabularyNodes(concepts, trimmedValue),
    [concepts, trimmedValue],
  );

  const highlightedNodeIds = useMemo(
    () => new Set(searchMatches.map((match) => match.nodeId)),
    [searchMatches],
  );

  const visibleSchemeIds = useMemo(() => {
    if (trimmedValue.length < SEARCH_MIN_LENGTH || searchMatches.length === 0) {
      return undefined;
    }

    const schemeIds = new Set<string>();
    for (const concept of concepts) {
      if (highlightedNodeIds.has(concept.id) || concept.id === selectedConcept?.id) {
        schemeIds.add(concept.schemeId);
      }
    }
    return schemeIds;
  }, [concepts, highlightedNodeIds, searchMatches.length, selectedConcept?.id, trimmedValue.length]);

  const bestMatch = searchMatches[0]
    ? concepts.find((concept) => concept.id === searchMatches[0].nodeId) ?? null
    : null;

  useEffect(() => {
    if (previousValueRef.current !== value) {
      setIsTreeOpen(true);
      previousValueRef.current = value;
    }
  }, [value]);

  const shouldShowTree = isTreeOpen;
  const shouldShowNoResults = trimmedValue.length >= SEARCH_MIN_LENGTH && searchMatches.length === 0;
  const shouldRenderTreePanel = concepts.length > 0;

  return (
    <div className="d-flex flex-column gap-2">
      <input
        type="text"
        className="form-control"
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />

      <div className="d-flex justify-content-between align-items-center gap-2">
        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
          Type at least {SEARCH_MIN_LENGTH} characters to search vocabularies.
        </div>
        {searchMatches.length > 0 ? (
          <span className="badge text-bg-light border">{searchMatches.length} match{searchMatches.length === 1 ? '' : 'es'}</span>
        ) : null}
      </div>

      {/* {selectedConcept ? (
        <div className="border rounded-3 px-3 py-2 bg-success-subtle">
          <div className="small fw-semibold">{getVocabularyNodeLabel(selectedConcept)}</div>
          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
            {selectedConcept.curie}
          </div>
        </div>
      ) : null} */}

      {shouldShowNoResults ? (
        <div className="border rounded-3 px-3 py-2 bg-light-subtle text-muted small">
          No controlled vocabulary term matches the current text.
        </div>
      ) : null}

      {shouldRenderTreePanel ? (
        <div className="border rounded-3 p-2 bg-body-tertiary">
          <button
            type="button"
            className="btn w-100 text-start d-flex justify-content-between align-items-center gap-2 px-1 pb-2 border-0"
            onClick={() => setIsTreeOpen((current) => !current)}
            aria-expanded={isTreeOpen}
          >
            <span className="small fw-semibold">
              Matching vocabulary trees
            </span>
            <span className="text-muted" aria-hidden>
              <i className={`bi bi-chevron-${isTreeOpen ? 'down' : 'right'}`} />
            </span>
          </button>
          {shouldShowTree ? (
            <div
              className="rounded-3"
              style={{
                maxHeight: '20rem',
                overflowY: 'auto',
                paddingRight: '0.25rem',
              }}
            >
              <VocabularyTree
                schemes={schemes}
                nodes={concepts}
                selectedNodeId={selectedConcept?.id ?? bestMatch?.id ?? null}
                highlightedNodeIds={highlightedNodeIds}
                visibleSchemeIds={visibleSchemeIds}
                onSelect={(concept) => onChange(concept.curie)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
