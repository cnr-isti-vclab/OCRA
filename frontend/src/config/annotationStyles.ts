/**
 * Shared annotation visual configuration.
 *
 * Source of truth for colours, filters, fonts and sizing used by annotation
 * renderers. Values are aligned with OpenLIME ManagerSvgAnnotation defaults,
 * but written explicitly to allow full centralized control.
 */

export const OPENLIME_ANNOTATION_SHADOW_FILTER = 'drop-shadow(1.5px 1.5px 2.0px rgba(0,0,0,0.80))';
export const OPENLIME_ANNOTATION_RUBBER_SHADOW_FILTER = 'drop-shadow(1px 1px 1.8px rgba(0,0,0,0.40))';

export const OPENLIME_ANNOTATION_STYLE_CONFIG = {
  defaultFill: 'rgba(0, 0, 0, 0.30)',
  defaultStroke: '#888888',
  defaultFillOpacity: 1,
  defaultStrokeWidth: 2,
  selectionFill: 'rgba(255,225,100,0.20)',
  selectionStroke: '#aaaa00',
  preloadStructuralFilters: true,
  showAnnotationLabels: true,
  semanticClasses: {
    default: {
      label: 'Default',
      fill: 'rgba(0, 0, 0, 0.30)',
      stroke: '#888888',
      fillOpacity: 1,
      strokeWidth: 2,
      fillSelected: 'rgba(255,225,100,0.20)',
      strokeSelected: '#aaaa00',
      fillUnderEditing: 'rgba(0, 0, 0, 0.30)',
      strokeUnderEditing: '#888888',
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
      fillSelected: 'rgba(255,225,100,0.20)',
      strokeSelected: '#aaaa00',
      fillUnderEditing: '#fa5aff',
      strokeUnderEditing: '#fa5aff',
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
      fill: 'rgba(255,225,100,0.20)',
      stroke: '#aaaa00',
      fillOpacity: 1,
      strokeWidth: 2,
      filter: OPENLIME_ANNOTATION_SHADOW_FILTER,
    },
    underEditing: {
      fill: 'rgba(0, 0, 0, 0.30)',
      stroke: '#888888',
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
    textFillSelected: '#aaaa00',
    textStroke: 'none',
    textStrokeWidthPx: 0,
    backgroundFill: 'rgba(0, 0, 0, 0.30)',
    backgroundFillSelected: 'rgba(0,0,0,0.60)',
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
    backgroundSelected: '#fff3cd',
    textSelected: '#212529',
    backgroundUnderEditing: '#f8d7da',
    textUnderEditing: '#212529',
  },
} as const;
