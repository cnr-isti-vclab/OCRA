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
    date: 'May 2026',
    highlights: [
      'Real-time annotation sync via Server-Sent Events',
      'HDT metadata views for physical objects and assets',
      'Optimistic concurrency control (OCC) for annotation editing',
      'Project structuring lock with heartbeat and draining state',
      'Audit log for admin users',
    ],
  },
  {
    version: '0.8.0',
    date: 'March 2026',
    highlights: [
      'Vocabulary management for annotation terms',
      'Role-based access control (manager / editor / viewer)',
      '3D viewer integration with OpenLime (NXS, OBJ)',
      'RTI viewer support',
    ],
  },
  {
    version: '0.7.0',
    date: 'January 2026',
    highlights: [
      'Initial release',
      'Project and user management',
      'Keycloak OAuth2 PKCE authentication',
      'Docker Compose single-command deployment',
    ],
  },
];
