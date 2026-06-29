import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { VocabularyScheme } from '../../types/vocabulary';
import {
  collectVocabularyAncestorIds,
  getVocabularyNodeLabel,
  getVocabularyNodeScopeNote,
  getVocabularySchemeLabel,
  type VocabularyTreeNode,
} from '../../utils/vocabulary';

interface VocabularyTreeProps {
  schemes: readonly VocabularyScheme[];
  nodes: readonly VocabularyTreeNode[];
  selectedNodeId: string | null;
  highlightedNodeIds?: ReadonlySet<string>;
  visibleSchemeIds?: ReadonlySet<string>;
  onSelect: (node: VocabularyTreeNode) => void;
}

interface VocabularyTreeBranchProps {
  node: VocabularyTreeNode;
  childrenByParentId: ReadonlyMap<string, VocabularyTreeNode[]>;
  expandedNodeIds: ReadonlySet<string>;
  highlightedNodeIds: ReadonlySet<string>;
  selectedNodeId: string | null;
  onSelect: (node: VocabularyTreeNode) => void;
  onToggleExpanded: (nodeId: string) => void;
  selectedElementRef: React.RefObject<HTMLButtonElement | null>;
  depth?: number;
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: '0.8rem',
        height: '0.8rem',
        borderRadius: '0.18rem',
        backgroundColor: color,
        border: '1px solid rgba(0, 0, 0, 0.18)',
        flexShrink: 0,
      }}
    />
  );
}

function VocabularyTreeBranch({
  node,
  childrenByParentId,
  expandedNodeIds,
  highlightedNodeIds,
  selectedNodeId,
  onSelect,
  onToggleExpanded,
  selectedElementRef,
  depth = 0,
}: VocabularyTreeBranchProps) {
  const children = childrenByParentId.get(node.id) ?? [];
  const isExpandable = children.length > 0;
  const isExpanded = expandedNodeIds.has(node.id);
  const isSelected = node.id === selectedNodeId;
  const isHighlighted = highlightedNodeIds.has(node.id);
  const scopeNote = getVocabularyNodeScopeNote(node);

  return (
    <div>
      <button
        type="button"
        ref={isSelected ? selectedElementRef : undefined}
        className={`btn w-100 text-start d-flex align-items-start gap-2 border-0 rounded-3 ${isSelected ? 'bg-primary-subtle' : isHighlighted ? 'bg-light' : ''}`}
        onClick={() => {
          onSelect(node);
          if (isExpandable && !isExpanded) {
            onToggleExpanded(node.id);
          }
        }}
        style={{
          paddingLeft: `${depth * 1.1 + 0.6}rem`,
          paddingRight: '0.6rem',
          paddingTop: '0.45rem',
          paddingBottom: '0.45rem',
        }}
      >
        <ColorSwatch color={node.color} />
        <span className="d-flex flex-column flex-grow-1 overflow-hidden">
          <span className={`small ${isSelected ? 'fw-semibold' : children.length > 0 ? 'fw-semibold' : ''}`}>
            {getVocabularyNodeLabel(node)}
          </span>
          <span className="text-muted" style={{ fontSize: '0.72rem' }}>
            {node.curie}
          </span>
          {scopeNote ? (
            <span className="text-muted" style={{ fontSize: '0.72rem', whiteSpace: 'normal' }}>
              {scopeNote}
            </span>
          ) : null}
        </span>
        {isExpandable ? (
          <span
            aria-hidden
            className="text-muted"
            style={{
              fontSize: '0.8rem',
              paddingTop: '0.1rem',
            }}
          >
            <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`} />
          </span>
        ) : null}
      </button>
      {isExpanded && isExpandable ? (
        <div>
          {children.map((child) => (
            <VocabularyTreeBranch
              key={child.id}
              node={child}
              childrenByParentId={childrenByParentId}
              expandedNodeIds={expandedNodeIds}
              highlightedNodeIds={highlightedNodeIds}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
              onToggleExpanded={onToggleExpanded}
              selectedElementRef={selectedElementRef}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function VocabularyTree({
  schemes,
  nodes,
  selectedNodeId,
  highlightedNodeIds = new Set<string>(),
  visibleSchemeIds,
  onSelect,
}: VocabularyTreeProps) {
  const selectedElementRef = useRef<HTMLButtonElement | null>(null);
  const [manuallyExpandedNodeIds, setManuallyExpandedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const parentIdByNodeId = useMemo(() => {
    const parentEntries = nodes.map((node) => {
      const parentId = 'broader' in node ? node.broader : node.subPropertyOf;
      return [node.id, parentId] as const;
    });
    return new Map<string, string | null>(parentEntries);
  }, [nodes]);

  const childrenByParentId = useMemo(() => {
    const children = new Map<string, VocabularyTreeNode[]>();
    for (const node of nodes) {
      const parentId = parentIdByNodeId.get(node.id);
      if (!parentId || !nodesById.has(parentId)) {
        continue;
      }
      const siblings = children.get(parentId) ?? [];
      siblings.push(node);
      children.set(parentId, siblings);
    }
    return children;
  }, [nodes, nodesById, parentIdByNodeId]);

  const automaticExpandedNodeIds = useMemo(() => {
    const expandedIds = new Set<string>();
    const relevantIds = new Set<string>(highlightedNodeIds);
    if (selectedNodeId) {
      relevantIds.add(selectedNodeId);
    }
    for (const nodeId of relevantIds) {
      for (const ancestorId of collectVocabularyAncestorIds(nodeId, parentIdByNodeId)) {
        expandedIds.add(ancestorId);
      }
    }
    return expandedIds;
  }, [highlightedNodeIds, parentIdByNodeId, selectedNodeId]);

  const expandedNodeIds = useMemo(() => {
    const expandedIds = new Set<string>(automaticExpandedNodeIds);
    for (const nodeId of manuallyExpandedNodeIds) {
      expandedIds.add(nodeId);
    }
    return expandedIds;
  }, [automaticExpandedNodeIds, manuallyExpandedNodeIds]);

  const rootNodesBySchemeId = useMemo(() => {
    const roots = new Map<string, VocabularyTreeNode[]>();
    for (const node of nodes) {
      const parentId = parentIdByNodeId.get(node.id);
      if (parentId && nodesById.has(parentId)) {
        continue;
      }
      const schemeRoots = roots.get(node.schemeId) ?? [];
      schemeRoots.push(node);
      roots.set(node.schemeId, schemeRoots);
    }
    return roots;
  }, [nodes, nodesById, parentIdByNodeId]);

  const normalizedSchemes = useMemo(() => {
    const schemesById = new Map(schemes.map((scheme) => [scheme.id, scheme]));
    for (const node of nodes) {
      if (!node.schemeId || schemesById.has(node.schemeId)) {
        continue;
      }
      schemesById.set(node.schemeId, {
        id: node.schemeId,
        curie: node.schemeId,
        lemma: node.schemeId,
        prefLabels: {},
        scopeNotes: {},
      });
    }
    return [...schemesById.values()];
  }, [nodes, schemes]);

  const visibleSchemes = useMemo(() => {
    if (!visibleSchemeIds || visibleSchemeIds.size === 0) {
      return normalizedSchemes;
    }
    return normalizedSchemes.filter((scheme) => visibleSchemeIds.has(scheme.id));
  }, [normalizedSchemes, visibleSchemeIds]);

  useEffect(() => {
    selectedElementRef.current?.scrollIntoView({
      block: 'nearest',
    });
  }, [selectedNodeId, highlightedNodeIds]);

  useEffect(() => {
    setManuallyExpandedNodeIds((current) => {
      const next = new Set<string>();
      for (const nodeId of current) {
        if (nodesById.has(nodeId)) {
          next.add(nodeId);
        }
      }
      return next.size === current.size ? current : next;
    });
  }, [nodesById]);

  const handleToggleExpanded = (nodeId: string) => {
    setManuallyExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <div className="d-flex flex-column gap-3">
      {visibleSchemes.map((scheme) => {
        const rootNodes = rootNodesBySchemeId.get(scheme.id) ?? [];
        if (rootNodes.length === 0) {
          return null;
        }

        return (
          <section key={scheme.id} className="border rounded-3 bg-white overflow-hidden">
            <div className="px-3 py-2 border-bottom bg-light-subtle">
              <div className="fw-semibold small">{getVocabularySchemeLabel(scheme)}</div>
              <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                {scheme.curie}
              </div>
            </div>
            <div className="py-2">
              {rootNodes.map((node) => (
                <VocabularyTreeBranch
                  key={node.id}
                  node={node}
                  childrenByParentId={childrenByParentId}
                  expandedNodeIds={expandedNodeIds}
                  highlightedNodeIds={highlightedNodeIds}
                  selectedNodeId={selectedNodeId}
                  onSelect={onSelect}
                  onToggleExpanded={handleToggleExpanded}
                  selectedElementRef={selectedElementRef}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
