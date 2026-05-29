/**
 * Shared annotation visual configuration.
 *
 * Source of truth for colours, filters, fonts and sizing used by annotation
 * renderers. Values are aligned with OpenLIME ManagerSvgAnnotation defaults,
 * but written explicitly to allow full centralized control.
 */

export const OPENLIME_ANNOTATION_SHADOW_FILTER = 'drop-shadow(1.5px 1.5px 2.0px rgba(0,0,0,0.80))';
export const OPENLIME_ANNOTATION_RUBBER_SHADOW_FILTER = 'drop-shadow(1px 1px 1.8px rgba(0,0,0,0.40))';

const UNDER_EDITING_COLOR = {
  fill: 'rgba(249, 115, 22, 0.22)',
  stroke: '#ea580c',
  text: '#7c2d12',
  background: '#ffedd5',
} as const;

const SELECTED_COLOR = {
  fill: 'rgba(37, 99, 235, 0.22)',
  stroke: '#2563eb',
  text: '#1e3a8a',
  background: '#dbeafe',
} as const;

export const OPENLIME_ANNOTATION_STYLE_CONFIG = {
  defaultFill: 'rgba(0, 0, 0, 0.30)',
  defaultStroke: '#888888',
  defaultFillOpacity: 1,
  defaultStrokeWidth: 2,
  selectionFill: SELECTED_COLOR.fill,
  selectionStroke: SELECTED_COLOR.stroke,
  preloadStructuralFilters: true,
  showAnnotationLabels: true,
  semanticClasses: {
    default: {
      label: 'Default',
      fill: 'rgba(0, 0, 0, 0.30)',
      stroke: '#888888',
      fillOpacity: 1,
      strokeWidth: 2,
      fillSelected: SELECTED_COLOR.fill,
      strokeSelected: SELECTED_COLOR.stroke,
      fillUnderEditing: UNDER_EDITING_COLOR.fill,
      strokeUnderEditing: UNDER_EDITING_COLOR.stroke,
      filter: OPENLIME_ANNOTATION_SHADOW_FILTER,
      filterSelected: OPENLIME_ANNOTATION_SHADOW_FILTER,
      filterUnderEditing: 'url(#olime-glow-soft)',
    },
    group: {
      label: 'Group',
      fill: '#fa5aff',
      stroke: '#fa5aff',
      fillOpacity: 0.7,
      strokeWidth: 2,
      fillSelected: SELECTED_COLOR.fill,
      strokeSelected: SELECTED_COLOR.stroke,
      fillUnderEditing: UNDER_EDITING_COLOR.fill,
      strokeUnderEditing: UNDER_EDITING_COLOR.stroke,
      filter: OPENLIME_ANNOTATION_SHADOW_FILTER,
      filterSelected: OPENLIME_ANNOTATION_SHADOW_FILTER,
      filterUnderEditing: 'url(#olime-glow-soft)',
    },
  },
  structuralClasses: {
    default: {
      fill: 'rgba(0, 0, 0, 0.30)',
      stroke: '#000000',
      fillOpacity: 1,
      strokeWidth: 2,
      filter: OPENLIME_ANNOTATION_SHADOW_FILTER,
    },
    selected: {
      fill: SELECTED_COLOR.fill,
      stroke: SELECTED_COLOR.stroke,
      fillOpacity: 1,
      strokeWidth: 2,
      filter: OPENLIME_ANNOTATION_SHADOW_FILTER,
    },
    underEditing: {
      fill: UNDER_EDITING_COLOR.fill,
      stroke: UNDER_EDITING_COLOR.stroke,
      fillOpacity: 1,
      strokeWidth: 2,
      filter: 'url(#olime-glow-soft)',
    },
  },
  labelStyle: {
    fontSizePx: 14,
    fontFamily: 'sans-serif',
    fontWeight: 600,
    textFill: '#ffffff',
    textFillSelected: SELECTED_COLOR.text,
    textStroke: 'none',
    textStrokeWidthPx: 0,
    backgroundFill: 'rgba(0, 0, 0, 0.30)',
    backgroundFillSelected: 'rgba(219, 234, 254, 0.92)',
    textFillUnderEditing: UNDER_EDITING_COLOR.text,
    backgroundFillUnderEditing: 'rgba(255, 237, 213, 0.92)',
    backgroundStroke: 'rgba(255, 255, 255, 0.22)',
    backgroundStrokeWidthPx: 1,
    paddingPx: 6,
    borderRadiusPx: 4,
    offsetYPx: 4,
  },
} as const;

export const ANNOTATION_PANEL_STYLE_CONFIG = {
  dataItem: {
    background: '#f8f9fa',
    text: '#212529',
    backgroundSelected: SELECTED_COLOR.background,
    textSelected: SELECTED_COLOR.text,
    backgroundUnderEditing: UNDER_EDITING_COLOR.background,
    textUnderEditing: UNDER_EDITING_COLOR.text,
  },
} as const;
