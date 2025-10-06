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
            id: { type: 'string', example: '507f1f77bcf86cd799439011' },
            username: { type: 'string', example: 'johndoe' },
            email: { type: 'string', format: 'email', example: 'john@example.com' },
            isAdmin: { type: 'boolean', example: false },
            canCreateProjects: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439012' },
            name: { type: 'string', example: 'My Research Project' },
            description: { type: 'string', example: 'A collaborative 3D modeling project' },
            ownerId: { type: 'string', example: '507f1f77bcf86cd799439011' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ProjectMember: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439013' },
            projectId: { type: 'string', example: '507f1f77bcf86cd799439012' },
            userId: { type: 'string', example: '507f1f77bcf86cd799439011' },
            role: { type: 'string', enum: ['viewer', 'editor', 'admin'], example: 'editor' },
            addedAt: { type: 'string', format: 'date-time' },
            addedBy: { type: 'string', example: '507f1f77bcf86cd799439010' },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439014' },
            action: { type: 'string', example: 'USER_CREATED' },
            entityType: { type: 'string', example: 'User' },
            entityId: { type: 'string', example: '507f1f77bcf86cd799439011' },
            userId: { type: 'string', example: '507f1f77bcf86cd799439010' },
            details: { type: 'object', additionalProperties: true },
            timestamp: { type: 'string', format: 'date-time' },
          },
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
