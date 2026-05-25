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
    version: '0.9.0',
    date: 'Jun 2026',
    highlights: [
      'Project activity dashboard with user and session analytics',
    ],
  },
  {
    version: '0.8.0',
    date: 'May 2026',
    highlights: [
      'OpenLIME viewer integration: 3D models (NXS/OBJ/GLB), RTI images, and 2D annotation overlay',
      'Full annotation REST API: create/read/update/delete with Swagger docs',
      'Annotation storage in MongoDB: separate geometry, data, and link collections',
      'Optimistic concurrency control (OCC) on annotation edits to prevent conflicts',
      'Real-time annotation sync via Server-Sent Events with per-scene social locks',
      'Project structuring lock: exclusive mode for destructive changes with drain countdown',
      'Editor role added to project permissions (manager / editor / viewer)',
      'Shared annotation schema module with Zod validation and CI schema checks',
      'HDT metadata model standardized (camelCase keys, unified scene description)',
    ],
  },
  {
    version: '0.7.0',
    date: 'January 2026',
    highlights: [
      'Initial prototype release',
      'Basic project and user management',
      'Keycloak OAuth2 PKCE authentication',
      'Docker Compose single-command deployment',
    ],
  },
];
