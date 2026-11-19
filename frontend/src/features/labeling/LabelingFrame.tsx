import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { OpenLIMEViewerRef } from '../../adapters/openlime-viewer/OpenLIMEViewer';
import type { OpenLimeLabelVisibility } from '../../adapters/annotation-store/openlimeAnnotationAdapter';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';
import {
  LabelingHeader,
  LabelingToolStrip,
  ToolHelpPanel,
  type LabelingDisplay,
  type LabelingTool,
} from './LabelingChrome';
import LabelsDock, { type LabelDef, type LabelRow } from './LabelsDock';

// Lets the header's Fill / Boundaries / Transparency reach the region paths,
// which live in OpenLIME's shadow DOM (custom properties cross it).
const SHADOW_STYLE_ID = 'ocra-labeling-display';
const SHADOW_STYLE = `.annotation-polyline {
  fill-opacity: var(--ocra-fill-opacity, 1);
  stroke-opacity: var(--ocra-stroke-opacity, 1);
}`;

/**
 * Labels the user created, per project. Kept in this browser: OCRA has no
 * per-project label store, and a label in use is stored on its regions anyway.
 */
function useCreatedLabels(): [LabelDef[], (defs: LabelDef[]) => void] {
  const { projectId } = useParams();
  const key = `ocra.labeling.labels.${projectId ?? ''}`;
  const [defs, setDefs] = useState<LabelDef[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  });
  const save = (next: LabelDef[]) => {
    setDefs(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // private mode / storage off: the labels still last for this session
    }
  };
  return [defs, save];
}

/** Labeling state the viewer needs: the labels, the active class for new regions, the assign action. */
export function useLabelingSession() {
  const { updateData, activeAnnotationSelection, sceneAnnotationClassPool } = useAnnotationStore();
  const [createdLabels, setCreatedLabels] = useCreatedLabels();
  const [activeClass, setActiveClass] = useState<string | null>(null);
  const [display, setDisplay] = useState<LabelingDisplay>({ transparency: 0, fill: true, boundaries: true });

  /** TagLab's bucket: give the active class to the annotation data of the clicked regions. */
  const assignActiveClass = useCallback(
    (dataIds: readonly string[]) => {
      for (const dataId of dataIds) {
        if ((activeAnnotationSelection.dataById.get(dataId)?.class ?? null) === activeClass) continue;
        void updateData(dataId, { class: activeClass }).catch((err) => {
          console.error('Failed to assign class:', err);
        });
      }
    },
    [activeAnnotationSelection, activeClass, updateData],
  );

  // created labels in creation order, then classes the scene's regions already use
  const rows = useMemo(() => {
    const byCurie = new Map<string, LabelRow>(createdLabels.map((def) => [def.curie, { ...def, count: 0, removable: true }]));
    for (const option of sceneAnnotationClassPool) {
      const created = byCurie.get(option.curie);
      byCurie.set(option.curie, {
        curie: option.curie,
        label: created?.label ?? option.label,
        color: created?.color ?? option.color,
        count: option.geometryCount,
        removable: false,
      });
    }
    return [...byCurie.values()];
  }, [createdLabels, sceneAnnotationClassPool]);

  /** Colour picked for a created label, which the viewer uses over the vocabulary's. Stable per label list. */
  const colorOf = useCallback(
    (curie: string) => createdLabels.find((d) => d.curie === curie)?.color,
    [createdLabels],
  );

  const addLabel = (def: LabelDef) => {
    setCreatedLabels([...createdLabels.filter((d) => d.curie !== def.curie), def]);
    setActiveClass(def.curie);
  };
  const removeLabel = (curie: string) => {
    setCreatedLabels(createdLabels.filter((d) => d.curie !== curie));
    if (activeClass === curie) setActiveClass(null);
  };

  return {
    rows,
    activeClass,
    setActiveClass,
    activeRow: rows.find((row) => row.curie === activeClass) ?? null,
    addLabel,
    removeLabel,
    colorOf,
    display,
    setDisplay,
    assignActiveClass,
  };
}

export type LabelingSession = ReturnType<typeof useLabelingSession>;

/**
 * TagLab-style chrome around the 2D viewer: header on top, tools on the left,
 * Labels/Info on the right, tool instructions over the viewer. The wrappers are
 * rendered whether or not `enabled`, so toggling never remounts the viewer.
 */
export default function LabelingFrame({
  enabled,
  session,
  tool,
  onToolChange,
  labelVisibility,
  onLabelVisibilityChange,
  viewer,
  children,
}: {
  enabled: boolean;
  session: LabelingSession;
  tool: LabelingTool;
  onToolChange: (tool: LabelingTool) => void;
  labelVisibility: OpenLimeLabelVisibility;
  onLabelVisibilityChange: (mode: OpenLimeLabelVisibility) => void;
  viewer: OpenLIMEViewerRef | null;
  children: ReactNode;
}) {
  const { clearFocus } = useAnnotationStore();
  const viewerBoxRef = useRef<HTMLDivElement>(null);
  const [viewerControlsShown, setViewerControlsShown] = useState(false);
  const manager = viewer?.getAnnotationManager() ?? null;

  // re-clicking a region that is already selected fires no selection change,
  // so assigning starts from an empty selection
  const deselectAll = () => {
    manager?.deselectAll?.();
    clearFocus();
  };
  const changeTool = (next: LabelingTool) => {
    if (next === 'assign' && tool !== 'assign') deselectAll();
    onToolChange(next);
  };
  const changeClass = (curie: string) => {
    session.setActiveClass(curie === session.activeClass ? null : curie);
    if (tool === 'assign') deselectAll();
  };

  useEffect(() => {
    const root = viewerBoxRef.current?.querySelector('.openlime-overlay')?.shadowRoot;
    if (!enabled || !root || root.getElementById(SHADOW_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SHADOW_STYLE_ID;
    style.textContent = SHADOW_STYLE;
    root.append(style);
  }, [enabled]);

  const { display } = session;
  const displayVars = enabled
    ? ({
        '--ocra-fill-opacity': display.fill ? String(1 - display.transparency / 100) : '0',
        '--ocra-stroke-opacity': display.boundaries ? '1' : '0',
      } as CSSProperties)
    : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {enabled && (
        <LabelingHeader
          display={display}
          onDisplayChange={session.setDisplay}
          labelVisibility={labelVisibility}
          onLabelVisibilityChange={onLabelVisibilityChange}
          viewerBox={viewerBoxRef.current}
          manager={manager}
        />
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {enabled && (
          <LabelingToolStrip
            tool={tool}
            onToolChange={changeTool}
            viewerControlsShown={viewerControlsShown}
            onToggleViewerControls={() => setViewerControlsShown(!viewerControlsShown)}
          />
        )}
        {/* overflow hidden: OpenLIME parks its closed layers menu just left of the viewer */}
        <div
          ref={viewerBoxRef}
          className={`labeling-viewer${enabled && !viewerControlsShown ? ' viewer-controls-hidden' : ''}`}
          style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', ...displayVars }}
        >
          {children}
          {enabled && tool !== 'sam2' && <ToolHelpPanel tool={tool} activeClassLabel={session.activeRow?.label ?? null} />}
        </div>
        {enabled && (
          <LabelsDock
            rows={session.rows}
            activeClass={session.activeClass}
            onActiveClassChange={changeClass}
            onAddLabel={session.addLabel}
            onRemoveLabel={session.removeLabel}
          />
        )}
      </div>
    </div>
  );
}
