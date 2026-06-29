import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  VocabularyConcept,
  VocabularyProperty,
  VocabularyScheme,
} from '../../types/vocabulary';
import VocabularyTree from './VocabularyTree';
import {
  getVocabularyNodeLabel,
  searchVocabularyNodes,
  type VocabularyTreeNode,
} from '../../utils/vocabulary';

const SEARCH_MIN_LENGTH = 4;

interface VocabularyClassPickerProps {
  inputId: string;
  value: string;
  onChange: (value: string) => void;
  schemes: readonly VocabularyScheme[];
  concepts: readonly VocabularyConcept[];
  properties?: readonly VocabularyProperty[];
  placeholder?: string;
}

export default function VocabularyClassPicker({
  inputId,
  value,
  onChange,
  schemes,
  concepts,
  properties = [],
  placeholder = 'Optional classification',
}: VocabularyClassPickerProps) {
  const trimmedValue = value.trim();
  const [isTreeOpen, setIsTreeOpen] = useState(false);
  const previousValueRef = useRef(value);
  const selectableNodes = useMemo<readonly VocabularyTreeNode[]>(
    () => [...properties, ...concepts],
    [concepts, properties],
  );

  const selectedNode = useMemo(
    () => selectableNodes.find((node) => node.curie === trimmedValue) ?? null,
    [selectableNodes, trimmedValue],
  );

  const searchMatches = useMemo(
    () => searchVocabularyNodes(selectableNodes, trimmedValue),
    [selectableNodes, trimmedValue],
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
    for (const node of selectableNodes) {
      if (highlightedNodeIds.has(node.id) || node.id === selectedNode?.id) {
        schemeIds.add(node.schemeId);
      }
    }
    return schemeIds;
  }, [highlightedNodeIds, searchMatches.length, selectableNodes, selectedNode?.id, trimmedValue.length]);

  const bestMatch = searchMatches[0]
    ? selectableNodes.find((node) => node.id === searchMatches[0].nodeId) ?? null
    : null;

  useEffect(() => {
    if (previousValueRef.current !== value) {
      setIsTreeOpen(true);
      previousValueRef.current = value;
    }
  }, [value]);

  const shouldShowTree = isTreeOpen;
  const shouldShowNoResults = trimmedValue.length >= SEARCH_MIN_LENGTH && searchMatches.length === 0;
  const shouldRenderTreePanel = selectableNodes.length > 0;

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
          <div className="small fw-semibold">{getVocabularyNodeLabel(selectedNode)}</div>
          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
            {selectedNode.curie}
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
                nodes={selectableNodes}
                selectedNodeId={selectedNode?.id ?? bestMatch?.id ?? null}
                highlightedNodeIds={highlightedNodeIds}
                visibleSchemeIds={visibleSchemeIds}
                onSelect={(node) => onChange(node.curie)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
