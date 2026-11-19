import { useMemo, useState } from 'react';
import type { AnnotationShape } from '../../../../shared/annotation-types';
import { useAnnotationStore } from '../../context/AnnotationStoreContext';

/** A label the user created: a vocabulary concept (curie) or a free-text class. */
export interface LabelDef {
  curie: string;
  label: string;
  color: string;
}

export interface LabelRow extends LabelDef {
  count: number;
  /** created here and not used by any region yet */
  removable: boolean;
}

// colours offered for a new free-text label, in turn
const NEW_LABEL_COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6'];

/** Area (px²) and border length (px) of a region; open polylines only add length. */
export function measureShapes(shapes: readonly AnnotationShape[]): { area: number; perimeter: number } {
  let area = 0;
  let perimeter = 0;
  for (const { type, vertices } of shapes) {
    if (type === 'ShapePoints') continue;
    const closed = type === 'ShapePolygon';
    const n = vertices.length;
    let twiceArea = 0;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const [x1, y1] = vertices[i];
      const [x2, y2] = vertices[(i + 1) % n];
      perimeter += Math.hypot(x2 - x1, y2 - y1);
      twiceArea += x1 * y2 - x2 * y1;
    }
    if (closed) area += Math.abs(twiceArea) / 2;
  }
  return { area, perimeter };
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** "+" form: a name (vocabulary concepts autocomplete) and a colour. */
function AddLabelForm({ colorIndex, onAdd, onCancel }: {
  colorIndex: number;
  onAdd: (def: LabelDef) => void;
  onCancel: () => void;
}) {
  const { vocabularyConcepts } = useAnnotationStore();
  const [name, setName] = useState('');
  const [color, setColor] = useState(NEW_LABEL_COLORS[colorIndex % NEW_LABEL_COLORS.length]);

  const findConcept = (text: string) => {
    const needle = text.trim().toLowerCase();
    return vocabularyConcepts.find((c) => c.curie.toLowerCase() === needle || c.prefLabelEn.toLowerCase() === needle);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    // a vocabulary concept keeps its curie, so the rest of OCRA resolves it
    const concept = findConcept(trimmed);
    onAdd(concept ? { curie: concept.curie, label: concept.prefLabelEn || concept.curie, color } : { curie: trimmed, label: trimmed, color });
  };

  return (
    <form
      className="labeling-add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <input
        className="labeling-input"
        list="labeling-vocabulary"
        placeholder="New label…"
        aria-label="Label name"
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          const concept = findConcept(e.target.value);
          if (concept?.color) setColor(concept.color);
        }}
      />
      <datalist id="labeling-vocabulary">
        {vocabularyConcepts.map((c) => <option key={c.curie} value={c.prefLabelEn || c.curie} />)}
      </datalist>
      <input type="color" aria-label="Label colour" value={color} onChange={(e) => setColor(e.target.value)} />
      <button type="submit" title="Add label" aria-label="Add label" disabled={!name.trim()}>
        <i className="bi bi-check-lg" aria-hidden />
      </button>
      <button type="button" title="Cancel" aria-label="Cancel" onClick={onCancel}>
        <i className="bi bi-x-lg" aria-hidden />
      </button>
    </form>
  );
}

/**
 * TagLab's right-hand docks while labeling: "Labels" lists the labels in use
 * plus those created here and picks the active class (applied to new regions
 * and by the assign tool); "Info" describes the selected region.
 */
export default function LabelsDock({
  rows,
  activeClass,
  onActiveClassChange,
  onAddLabel,
  onRemoveLabel,
}: {
  rows: readonly LabelRow[];
  activeClass: string | null;
  onActiveClassChange: (curie: string) => void;
  onAddLabel: (def: LabelDef) => void;
  onRemoveLabel: (curie: string) => void;
}) {
  const { focusedGeometryIds, activeAnnotationSelection } = useAnnotationStore();
  const [adding, setAdding] = useState(false);

  const info = useMemo(() => {
    const geometries = [...focusedGeometryIds]
      .map((id) => activeAnnotationSelection.geometriesById.get(id))
      .filter((g) => g !== undefined);
    if (geometries.length === 0) return null;

    const { area, perimeter } = measureShapes(geometries.flatMap((g) => g.shapes));
    if (geometries.length > 1) {
      return { single: false, count: geometries.length, area, perimeter } as const;
    }

    const geometry = geometries[0];
    const dataId = activeAnnotationSelection.dataIdsByGeometryId.get(geometry.id)?.[0];
    const data = dataId ? activeAnnotationSelection.dataById.get(dataId) : undefined;
    const className = data?.class ?? null;
    return {
      single: true,
      id: geometry.id,
      label: data?.label,
      classRow: rows.find((row) => row.curie === className),
      className,
      area,
      perimeter,
    } as const;
  }, [focusedGeometryIds, activeAnnotationSelection, rows]);

  return (
    <div className="labeling labeling-dock">
      <section className="labeling-labels">
        <div className="labeling-dock-title">
          <h6>Labels</h6>
          <button type="button" title="New label" aria-label="New label" onClick={() => setAdding(true)}>
            <i className="bi bi-plus-lg" aria-hidden />
          </button>
        </div>
        {adding && (
          <AddLabelForm
            colorIndex={rows.length}
            onAdd={(def) => {
              onAddLabel(def);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        <div className="labeling-box labeling-table-wrap">
          {rows.length === 0 ? (
            <p className="labeling-empty">No labels yet. Add one with <i className="bi bi-plus-lg" aria-label="+" />.</p>
          ) : (
            <table className="labeling-table">
              <colgroup>
                <col style={{ width: 28 }} />
                <col />
                <col style={{ width: 42 }} />
                <col style={{ width: 28 }} />
              </colgroup>
              <thead>
                <tr>
                  <th />
                  <th>Class</th>
                  <th title="Number of regions">#R</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.curie}
                    className={row.curie === activeClass ? 'active' : undefined}
                    onClick={() => onActiveClassChange(row.curie)}
                    title={`${row.curie} (click again to deselect)`}
                    aria-selected={row.curie === activeClass}
                  >
                    <td style={{ textAlign: 'center' }}>
                      <span className="labeling-swatch" style={{ backgroundColor: row.color }} />
                    </td>
                    <td>{row.label}</td>
                    <td style={{ textAlign: 'center' }}>{row.count}</td>
                    <td style={{ padding: 0, textAlign: 'center' }}>
                      {row.removable && (
                        <button
                          type="button"
                          className="labeling-row-remove"
                          title="Remove label"
                          aria-label={`Remove ${row.label}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveLabel(row.curie);
                          }}
                        >
                          <i className="bi bi-x" aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h6>Info</h6>
        <dl className="labeling-box labeling-info">
          {!info && <dd style={{ gridColumn: '1 / -1', color: 'var(--lb-muted)' }}>No region selected</dd>}
          {info?.single && (
            <>
              <dt>Id:</dt>
              <dd title={info.id}>{info.id.slice(-8)}</dd>
              <dt>Class:</dt>
              <dd title={info.className ?? undefined}>
                {info.classRow && (
                  <span className="labeling-swatch me-1" style={{ backgroundColor: info.classRow.color }} />
                )}
                {info.classRow?.label ?? info.className ?? '—'}
              </dd>
              {info.label && (
                <>
                  <dt>Label:</dt>
                  <dd title={info.label}>{info.label}</dd>
                </>
              )}
            </>
          )}
          {info && !info.single && (
            <>
              <dt>Regions:</dt>
              <dd>{info.count}</dd>
            </>
          )}
          {info && (
            <>
              <dt>Area:</dt>
              <dd>{fmt(info.area)} px²</dd>
              <dt>Perimeter:</dt>
              <dd>{fmt(info.perimeter)} px</dd>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}
