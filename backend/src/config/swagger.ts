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

Most endpoints require authentication via session cookies or bearer tokens:
- **Session Cookie**: Set automatically after login, used for browser-based clients
- **Bearer Token**: Include in Authorization header as \`Bearer <token>\` for API clients

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
        sessionAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'Session cookie set after login',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Bearer token for API authentication',
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
    ],
  },
  apis: [
    './src/routes/*.ts', // Path to route files with JSDoc comments
    './src/controllers/*.ts', // Path to controller files if needed
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
