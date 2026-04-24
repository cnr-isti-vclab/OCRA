import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OCRA Backend API',
      version: '1.0.0',
      description: `
OCRA (Open Collaborative Research Archive) Backend API provides comprehensive endpoints for:
- User authentication and session management
- Project management and file uploads
- Project member management with role-based access
- User administration and privilege management
- Health monitoring and audit logging

## Authentication

Most endpoints require authentication via a session id, passed either as a cookie or in the Authorization header:
- **Session Cookie**: Set automatically after login, used for browser-based clients
- **Session Bearer**: Include the session id in the Authorization header as \`Bearer <session_id>\` for API clients

## Rate Limiting

API endpoints may be rate-limited to prevent abuse. Check response headers for rate limit information.

## Audit Logging

All sensitive operations (user creation, privilege changes, member management) are automatically logged
to the audit trail. Admins can review audit logs via the audit endpoints.
      `,
      contact: {
        name: 'OCRA Development Team',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3002',
        description: 'Development server',
      },
      {
        url: 'http://{host}:3002',
        description: 'Custom host server',
        variables: {
          host: {
            default: 'localhost',
            description: 'Server host (can be IP address or hostname)',
          },
        },
      },
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'session_id',
          description: 'Session cookie set after login',
        },
        sessionBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'Session id forwarded in the Authorization header as Bearer <session_id>',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'cmitzezdl0003uejviisow6zg',
            },
            sub: {
              type: 'string',
              description: 'External identity provider subject identifier',
              example: 'b4b55cc9-fc63-4d8f-9993-4fac36cedcaa',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'admin@ocra.it',
            },
            name: {
              type: 'string',
              description: 'Full display name',
              example: 'System Administrator',
            },
            username: {
              type: 'string',
              example: 'administrator',
            },
            given_name: {
              type: 'string',
              example: 'System',
            },
            family_name: {
              type: 'string',
              example: 'Administrator',
            },
            middle_name: {
              type: 'string',
              nullable: true,
              example: null,
            },
            sys_admin: {
              type: 'boolean',
              example: true,
            },
            sys_creator: {
              type: 'boolean',
              example: false,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-12-06T07:38:16.857Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-12-14T07:55:31.402Z',
            },
          },
        },
        UserWithStats: {
          allOf: [
            { $ref: '#/components/schemas/User' },
            {
              type: 'object',
              properties: {
                managedProjectsCount: {
                  type: 'integer',
                  description: 'Number of projects where the user is a manager',
                  example: 1,
                },
                lastLoginAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Timestamp of the last login, if available',
                  example: '2025-12-14T07:55:31.415Z',
                },
              },
            },
          ],
        },
        ProjectManager: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cmitzelrh0000uejvvncbe969' },
            email: {
              type: 'string',
              format: 'email',
              example: 'director@example.com',
            },
            name: { type: 'string', example: 'Roberto Neri' },
            username: { type: 'string', example: 'museum-director' },
            displayName: { type: 'string', example: 'Roberto Neri' },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'cmj465eyp0002ueycc7m1ucxm' },
            name: { type: 'string', example: 'TEST' },
            description: {
              type: 'string',
              example: 'Draft project created from UI',
            },
            public: { type: 'boolean', example: false },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-12-13T10:44:29.570Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-12-13T10:44:35.924Z',
            },
            manager: {
              $ref: '#/components/schemas/ProjectManager',
            },
          },
        },
        ProjectMember: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439013' },
            projectId: { type: 'string', example: '507f1f77bcf86cd799439012' },
            userId: { type: 'string', example: '507f1f77bcf86cd799439011' },
            role: { type: 'string', enum: ['manager', 'editor', 'viewer'], example: 'editor' },
            addedAt: { type: 'string', format: 'date-time' },
            addedBy: { type: 'string', example: '507f1f77bcf86cd799439010' },
          },
        },
        UserAuditLogResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            userSub: { type: 'string', example: 'b4b55cc9-fc63-4d8f-9993-4fac36cedcaa' },
            auditLog: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/AuditLogEntry'
              }
            }
          },
          required: ['success', 'userSub', 'auditLog']
        },
        AdminAuditLogResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            totalEvents: { type: 'integer', example: 100 },
            auditLog: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/AuditLogEntry'
              }
            }
          },
          required: ['success', 'totalEvents', 'auditLog']
        },
        AuditLogEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '8538f4e3-e1a9-4d40-9d17-34a93c9eb0db' },
            eventType: { type: 'string', example: 'auth.login' },
            success: { type: 'boolean', example: true },
            userAgent: { type: 'string', example: 'Mozilla/5.0 (X11; Linux x86_64)...' },
            createdAt: { type: 'string', format: 'date-time', example: '2025-12-15T11:01:32.641Z' },
            errorMessage: { type: ['string', 'null'], example: null },
            userSub: { type: 'string', example: 'b4b55cc9-fc63-4d8f-9993-4fac36cedcaa' },
            user: {
              type: 'object',
              properties: {
                sub: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' },
                username: { type: 'string' },
                displayName: { type: 'string' }
              }
            },
            resource: { type: ['object', 'null'], example: null },
            payload: { type: 'object', additionalProperties: true }
          },
          required: ['id', 'eventType', 'success', 'createdAt', 'userSub']
        },
        CreateSessionRequest: {
          type: 'object',
          required: ['userProfile', 'tokens'],
          properties: {
            userProfile: {
              type: 'object',
              properties: {
                sub: { type: 'string', example: 'b4b55cc9-fc63-4d8f-9993-4fac36cedcaa' },
                name: { type: 'string', example: 'System Administrator' },
                email: { type: 'string', example: 'admin@ocra.it' },
                preferred_username: { type: 'string', example: 'administrator' }
              }
            },
            tokens: {
              type: 'object',
              properties: {
                access_token: { type: 'string' },
                id_token: { type: 'string' },
                refresh_token: { type: 'string' }
              }
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'An error occurred' },
            details: { type: 'string', example: 'Additional error information' },
          },
        },
        AnnotationVertex3D: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'number' },
          example: [0.42, 0.31, 0.12],
        },
        AnnotationShapePoints: {
          type: 'object',
          required: ['type', 'vertices'],
          properties: {
            type: { type: 'string', enum: ['ShapePoints'] },
            vertices: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/AnnotationVertex3D' },
            },
          },
        },
        AnnotationShapePolyline: {
          type: 'object',
          required: ['type', 'vertices'],
          properties: {
            type: { type: 'string', enum: ['ShapePolyline'] },
            vertices: {
              type: 'array',
              minItems: 2,
              items: { $ref: '#/components/schemas/AnnotationVertex3D' },
            },
          },
        },
        AnnotationShapePolygon: {
          type: 'object',
          required: ['type', 'vertices'],
          properties: {
            type: { type: 'string', enum: ['ShapePolygon'] },
            vertices: {
              type: 'array',
              minItems: 3,
              items: { $ref: '#/components/schemas/AnnotationVertex3D' },
            },
          },
        },
        AnnotationShape: {
          oneOf: [
            { $ref: '#/components/schemas/AnnotationShapePoints' },
            { $ref: '#/components/schemas/AnnotationShapePolyline' },
            { $ref: '#/components/schemas/AnnotationShapePolygon' },
          ],
        },
        AnnotationGeometry: {
          type: 'object',
          required: [
            'id',
            'projectId',
            'shapes',
            'referenceType',
            'referenceId',
            'version',
            'createdAt',
            'createdBy',
            'updatedAt',
            'updatedBy',
          ],
          properties: {
            id: { type: 'string', example: 'ag_123e4567-e89b-12d3-a456-426614174000' },
            projectId: { type: 'string', example: 'cmproject123' },
            shapes: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/AnnotationShape' },
            },
            referenceType: { type: 'string', enum: ['scene', 'asset'], example: 'scene' },
            referenceId: { type: 'string', example: 'scene-main' },
            version: { type: 'integer', example: 0 },
            erasableAt: { type: 'string', format: 'date-time', nullable: true, example: null },
            erasableBy: { type: 'string', nullable: true, example: null },
            createdAt: { type: 'string', format: 'date-time', example: '2026-04-24T10:00:00.000Z' },
            createdBy: { type: 'string', example: 'cmuser123' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-04-24T10:00:00.000Z' },
            updatedBy: { type: 'string', example: 'cmuser123' },
          },
        },
        AnnotationData: {
          type: 'object',
          required: [
            'id',
            'projectId',
            'label',
            'description',
            'class',
            'content',
            'visibilityType',
            'visibilityId',
            'version',
            'createdAt',
            'createdBy',
            'updatedAt',
            'updatedBy',
          ],
          properties: {
            id: { type: 'string', example: 'ad_123e4567-e89b-12d3-a456-426614174000' },
            projectId: { type: 'string', example: 'cmproject123' },
            label: { type: 'string', example: 'Crack on column base' },
            description: { type: 'string', example: 'Horizontal crack, approx 3 cm' },
            class: { type: 'string', nullable: true, example: 'damage' },
            content: { type: 'object', additionalProperties: true, example: { severity: 'medium' } },
            visibilityType: { type: 'string', enum: ['scene', 'asset'], example: 'asset' },
            visibilityId: { type: 'string', example: 'asset-col-01' },
            version: { type: 'integer', example: 0 },
            erasableAt: { type: 'string', format: 'date-time', nullable: true, example: null },
            erasableBy: { type: 'string', nullable: true, example: null },
            createdAt: { type: 'string', format: 'date-time', example: '2026-04-24T10:00:00.000Z' },
            createdBy: { type: 'string', example: 'cmuser123' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-04-24T10:00:00.000Z' },
            updatedBy: { type: 'string', example: 'cmuser123' },
          },
        },
        AnnotationLink: {
          type: 'object',
          required: [
            'id',
            'projectId',
            'geometryId',
            'dataId',
            'version',
            'createdAt',
            'createdBy',
            'updatedAt',
            'updatedBy',
          ],
          properties: {
            id: { type: 'string', example: 'al_123e4567-e89b-12d3-a456-426614174000' },
            projectId: { type: 'string', example: 'cmproject123' },
            geometryId: { type: 'string', example: 'ag_123e4567-e89b-12d3-a456-426614174000' },
            dataId: { type: 'string', example: 'ad_123e4567-e89b-12d3-a456-426614174000' },
            version: { type: 'integer', example: 0 },
            erasableAt: { type: 'string', format: 'date-time', nullable: true, example: null },
            erasableBy: { type: 'string', nullable: true, example: null },
            createdAt: { type: 'string', format: 'date-time', example: '2026-04-24T10:00:00.000Z' },
            createdBy: { type: 'string', example: 'cmuser123' },
            updatedAt: { type: 'string', format: 'date-time', example: '2026-04-24T10:00:00.000Z' },
            updatedBy: { type: 'string', example: 'cmuser123' },
          },
        },
        AnnotationSceneBundle: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            geometries: {
              type: 'array',
              items: { $ref: '#/components/schemas/AnnotationGeometry' },
            },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/AnnotationData' },
            },
            links: {
              type: 'array',
              items: { $ref: '#/components/schemas/AnnotationLink' },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Health check and system status endpoints',
      },
      {
        name: 'Authentication',
        description: 'User authentication and session management',
      },
      {
        name: 'Session',
        description: 'Session information and management',
      },
      {
        name: 'Users',
        description: 'User profile and preferences',
      },
      {
        name: 'Projects',
        description: 'Project management and file operations',
      },
      {
        name: 'Project Members',
        description: 'Project member management and role assignment',
      },
      {
        name: 'User Administration',
        description: 'User management and privilege administration (admin only)',
      },
      {
        name: 'Annotations',
        description: 'Scene-facing annotation read and mutation endpoints',
      },
      {
        name: 'Annotation Geometry',
        description: 'Annotation geometry read and mutation endpoints',
      },
      {
        name: 'Annotation Data',
        description: 'Annotation data read and mutation endpoints',
      },
      {
        name: 'Annotation Links',
        description: 'Annotation link read and mutation endpoints',
      },
    ],
  },
  apis: [
    './src/routes/*.ts', // Path to route files with JSDoc comments
    './src/controllers/*.ts', // Path to controller files if needed
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
