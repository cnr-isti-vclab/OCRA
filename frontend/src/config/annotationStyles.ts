/**
 * Shared annotation visual configuration.
 *
 * Source of truth for colours, filters, fonts and sizing used by annotation
 * renderers. Values are aligned with OpenLIME ManagerSvgAnnotation defaults,
 * but written explicitly to allow full centralized control.
 */

export const OPENLIME_ANNOTATION_SHADOW_FILTER = 'drop-shadow(1.5px 1.5px 2.0px rgba(0,0,0,0.80))';
export const OPENLIME_ANNOTATION_RUBBER_SHADOW_FILTER = 'drop-shadow(1px 1px 1.8px rgba(0,0,0,0.40))';

const MARKED_COLOR = {
  fill: 'rgba(0,0,0,0.30)',
  stroke: 'rgba(255, 255, 255, 1)',
} as const;

const DEFAULT_COLOR = {
  fill: MARKED_COLOR.fill,
  stroke: MARKED_COLOR.stroke,
  text: MARKED_COLOR.stroke,
  background: MARKED_COLOR.fill,
} as const;

const UNDER_EDITING_COLOR = {
  fill: DEFAULT_COLOR.fill,
  stroke: DEFAULT_COLOR.stroke,
  text: 'rgba(153, 27, 27, 1)',
  background: 'rgba(254, 226, 226, 0.92)',
} as const;

const SELECTED_COLOR = {
  fill: 'rgba(219, 234, 254, 0.5)',
  stroke: 'rgba(30, 58, 138, 1)',
  text: 'rgba(30, 58, 138, 1)',
  background: 'rgba(219, 234, 254, 0.5)',
} as const;

export const OPENLIME_ANNOTATION_STYLE_CONFIG = {
  labelVisibility: 'selected',
  defaultFill: DEFAULT_COLOR.fill,
  defaultStroke: DEFAULT_COLOR.stroke,
  defaultFillOpacity: 1,
  defaultStrokeWidth: 2,
  selectionFill: SELECTED_COLOR.fill,
  selectionStroke: SELECTED_COLOR.stroke,
  preloadStructuralFilters: true,
  showAnnotationLabels: true,
  semanticClasses: {
  },
  structuralClasses: {
    default: {
      fill: DEFAULT_COLOR.fill,
      stroke: DEFAULT_COLOR.stroke,
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
      filter: 'drop-shadow(0px 0px 6.0px rgba(255,0,0,1.0))',
    },
  },
  labelStyle: {
    fontSizePx: 14,
    fontFamily: 'sans-serif',
    fontWeight: 600,
    textFill: DEFAULT_COLOR.text,
    textFillSelected: SELECTED_COLOR.text,
    textStroke: 'none',
    textStrokeWidthPx: 0,
    backgroundFill: DEFAULT_COLOR.background,
    backgroundFillSelected: SELECTED_COLOR.background,
    textFillUnderEditing: UNDER_EDITING_COLOR.stroke,
    backgroundFillUnderEditing: UNDER_EDITING_COLOR.fill,
    backgroundStrokeUnderEditing: 'rgba(220, 38, 38, 1)',
    backgroundStroke: 'none',
    backgroundStrokeWidthUnderEditingPx: 1,
    backgroundStrokeWidthPx: 0,
    paddingPx: 6,
    borderRadiusPx: 4,
    offsetYPx: 4,
  },
} as const;

export const ANNOTATION_PANEL_STYLE_CONFIG = {
  dataItem: {
    background: 'rgba(248, 249, 250, 1)',
    text: 'rgba(33, 37, 41, 1)',
    backgroundSelected: SELECTED_COLOR.background,
    textSelected: SELECTED_COLOR.text,
    backgroundUnderEditing: UNDER_EDITING_COLOR.background,
    textUnderEditing: UNDER_EDITING_COLOR.text,
  },
} as const;
