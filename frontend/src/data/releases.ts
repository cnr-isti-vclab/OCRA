export interface Release {
  version: string;
  date: string;
  highlights: string[];
}

/**
 * Release notes shown on the landing page.
 * Add a new entry at the top whenever a notable release is made.
 * Keep highlights concise — one line per change, user-facing language.
 */
export const releases: Release[] = [
  {
    version: '202606',
    date: 'Jun 2026',
    highlights: [
      'Project activity dashboard with user and session analytics',
      'Collaborative review workflow: lock-aware annotation access and conflict resolution UX',
      'Full collaborative annotation UI: create, update, and delete geometry and metadata in-viewer'
    ],
  },
  {
    version: '202605',
    date: 'May 2026',
    highlights: [
      'Optimistic concurrency control (OCC) on annotation edits to prevent conflicts',
      'Real-time annotation sync via Server-Sent Events with per-scene social locks (presence + editor)',
      'Project structuring lock UX: drain countdown, requester visibility, and 30 s grace period',
      'Editor role added to project permissions (manager / editor / viewer)',
      'Shared annotation schema module with Zod validation and CI schema checks',
      'HDT metadata standardised: camelCase keys, unified scene description for HC1/HC2 contexts',
    ],
  },
  {
    version: '202604',
    date: 'Apr 2026',
    highlights: [
      'Full annotation REST API: create/read/update/delete with Swagger/OpenAPI docs',
      'Project structuring lock: exclusive mode for destructive changes with drain state machine',
      'Real-time event bus via SSE: annotation mutations and structuring-lock state broadcasts',
      'Annotation lifecycle refactored to weak/strong model; enriched events with impact metadata',
    ],
  },
  {
    version: '202603',
    date: 'Mar 2026',
    highlights: [
      'Annotation data model: decomposed geometry + data + link entities on MongoDB',
      'Separate MongoDB databases for audit events and annotation content',
      'Stable asset references and URIs for scenes and 3D/RTI resources inside OCRA',
      'Wikidata and RDF import adapters for vocabulary-driven annotation terms',
    ],
  },
  {
    version: '202602',
    date: 'Feb 2026',
    highlights: [
      'OpenLIME viewer integrated: 3D models (NXS/OBJ/GLB), RTI images, and 2D SVG annotation overlay',
      'Scene description model wires digital assets to the viewer automatically',
      'Frontend annotation context: callbacks and cross-viewer (2D / 3D / panel) synchronisation',
    ],
  },
  {
    version: '202512',
    date: 'Dec 2025',
    highlights: [
      'RTI (Reflectance Transformation Imaging) asset loading and visualisation',
      'Unified asset upload pipeline for 3D models and RTI images',
      'OpenAPI documentation for all project and asset endpoints',
      'GitHub Actions CI workflow with automated API test suite',
      'OCRA branding: logo, favicon, and production Docker configuration',
    ],
  },
  {
    version: '202510',
    date: 'Oct 2025',
    highlights: [
      'HDT (Heritage Digital Twin) project metadata model aligned with HDTO ontology',
      'Vocabulary management for structured annotation terms',
      'Multi-resolution 3D model streaming via Nexus (NXS format)',
      'RDF export for project data',
    ],
  },
  {
    version: '202509',
    date: 'Sep 2025',
    highlights: [
      'Core OCRA web application: React 19 frontend + Node.js/Express backend',
      'Keycloak / ECHOES AAI-SSO integration (OAuth2 PKCE) for production-oriented access',
      'Project creation and role-based access management (manager / viewer)',
      'PostgreSQL and MongoDB persistence for projects, sessions, and audit events',
      'Initial 3D asset viewer with scene lighting controls',
      'Docker Compose single-command deployment',
    ],
  },
];
