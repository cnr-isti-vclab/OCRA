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
            activeUserCount: {
              type: 'integer',
              minimum: 0,
              description: 'Number of distinct active users currently connected to the project through viewing or editing presence leases.',
              example: 3,
            },
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
            currentUserRole: {
              type: 'string',
              enum: ['manager', 'editor', 'viewer'],
              nullable: true,
              description: 'Role of the current authenticated user on this specific project. Null when the user has access without an explicit project role.',
              example: 'editor',
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
          allOf: [
            { $ref: '#/components/schemas/ApiErrorResponse' },
          ],
        },
        ApiErrorResponse: {
          type: 'object',
          required: ['success', 'error', 'code', 'status', 'timestamp'],
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'An error occurred' },
            code: { type: 'string', example: 'common.internal_error' },
            status: { type: 'integer', example: 500 },
            requestId: { type: 'string', example: '0d16a4d4-5d6f-4d80-a511-8e883eff2d73' },
            details: {
              oneOf: [
                { type: 'string', example: 'Additional error information' },
                { type: 'object', additionalProperties: true },
              ],
            },
            timestamp: { type: 'string', format: 'date-time', example: '2026-04-25T10:30:00.000Z' },
            path: { type: 'string', example: '/api/sessions/current' },
            method: { type: 'string', example: 'GET' },
          },
        },
        Vector2: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'number' },
          example: [15, 25],
        },
        Vector3: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'number' },
          example: [0, 0, 0],
        },
        ScaleVector: {
          oneOf: [
            { type: 'number', example: 1 },
            { $ref: '#/components/schemas/Vector3' },
          ],
        },
        DublinCoreMetadata: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            creator: { type: 'string' },
            subject: { type: 'string' },
            description: { type: 'string' },
            publisher: { type: 'string' },
            contributor: { type: 'string' },
            date: { type: 'string' },
            type: { type: 'string' },
            format: { type: 'string' },
            identifier: { type: 'string' },
            source: { type: 'string' },
            language: { type: 'string' },
            relation: { type: 'string' },
            coverage: { type: 'string' },
            rights: { type: 'string' },
          },
        },
        CidocCrmMetadata: {
          type: 'object',
          additionalProperties: false,
          properties: {
            objectType: { type: 'string' },
            timeSpan: {
              type: 'object',
              additionalProperties: false,
              properties: {
                begin: { type: 'string' },
                end: { type: 'string' },
              },
            },
            period: { type: 'string' },
            production: {
              type: 'object',
              additionalProperties: false,
              properties: {
                technique: { type: 'string' },
                place: { type: 'string' },
                actor: { type: 'string' },
              },
            },
            material: {
              type: 'array',
              items: { type: 'string' },
            },
            dimension: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  type: { type: 'string' },
                  value: { type: 'number' },
                  unit: { type: 'string' },
                },
              },
            },
            currentLocation: { type: 'string' },
            condition: { type: 'string' },
          },
        },
        PhysicalObjectMetadata: {
          type: 'object',
          required: ['sourceUri', 'sourceType'],
          additionalProperties: true,
          properties: {
            sourceUri: {
              type: 'string',
              example: 'urn:ocra:project:cmproject123',
            },
            sourceType: {
              type: 'string',
              enum: ['echoes', 'wikidata', 'arco', 'europeana', 'other'],
              example: 'other',
            },
            sourceSelectionLocked: {
              type: 'boolean',
              description: 'Whether metadata source selection is currently locked after HC1 initialization/import.',
              example: true,
            },
            dublinCore: {
              $ref: '#/components/schemas/DublinCoreMetadata',
            },
            cidocCrm: {
              $ref: '#/components/schemas/CidocCrmMetadata',
            },
            sourceRecord: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
        EchoesAssetRecord: {
          type: 'object',
          required: ['assetId', 'assetUri'],
          properties: {
            assetId: { type: 'string', example: 'asset_1710000000000_abc123xyz' },
            assetUri: { type: 'string', example: 'urn:asset:uc2lamina_rti_001' },
            sourceUrl: { type: 'string', nullable: true, example: 'https://vicserver.crs4.it/ocra-assets/uc2_lamina.zip' },
          },
        },
        EchoesContext: {
          type: 'object',
          required: ['origin', 'syncStatus', 'projectUri'],
          properties: {
            origin: {
              type: 'string',
              enum: ['local', 'imported'],
              example: 'imported',
            },
            syncStatus: {
              type: 'string',
              enum: ['local', 'registered', 'synced', 'dirty'],
              example: 'synced',
            },
            projectUri: {
              type: 'string',
              example: 'http://echoes-eccch.eu/project/ECHOES',
            },
            heritageEntityUri: {
              type: 'string',
              nullable: true,
              example: 'https://data.ocra.echoes.eu/heritage-entity/uc2-lamina',
            },
            digitalTwinUri: {
              type: 'string',
              nullable: true,
              example: 'http://echoes-eccch.eu/HDT/JGrV52jtL3z',
            },
            namedGraphUri: {
              type: 'string',
              nullable: true,
              example: 'http://echoes-eccch.eu/kb/graph/user-fbettio/1782385399718/2026-06-25',
            },
            digitalTwinLabel: {
              type: 'string',
              nullable: true,
              example: 'HDT UC2 Lamina',
            },
            importedFromEchoesAt: { type: 'string', format: 'date-time', nullable: true },
            lastRegisteredAt: { type: 'string', format: 'date-time', nullable: true },
            lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
            lastSyncedProjectUpdatedAt: { type: 'string', format: 'date-time', nullable: true },
            assetRecords: {
              type: 'array',
              items: { $ref: '#/components/schemas/EchoesAssetRecord' },
            },
          },
        },
        EchoesHdtListItem: {
          type: 'object',
          required: ['digitalTwinUri'],
          properties: {
            digitalTwinUri: {
              type: 'string',
              example: 'http://echoes-eccch.eu/HDT/JGrV52jtL3z',
            },
            label: {
              type: 'string',
              nullable: true,
              example: 'HDT UC2 Lamina',
            },
            userUri: {
              type: 'string',
              nullable: true,
              example: 'http://echoes-eccch.eu/user/fbettio',
            },
          },
        },
        EchoesNamedGraphListItem: {
          type: 'object',
          required: ['namedGraphUri', 'digitalTwinUri'],
          properties: {
            namedGraphUri: {
              type: 'string',
              example: 'http://echoes-eccch.eu/kb/graph/user-fbettio/1782385399718/2026-06-25',
            },
            digitalTwinUri: {
              type: 'string',
              example: 'http://echoes-eccch.eu/HDT/JGrV52jtL3z',
            },
            label: {
              type: 'string',
              nullable: true,
              example: 'HDT UC2 Lamina',
            },
            title: {
              type: 'string',
              nullable: true,
              example: 'Lamina in argento con decorazione a rosette e disco solare (UC2 Lamina)',
            },
            identifier: {
              type: 'string',
              nullable: true,
              example: 'UC2-LAMINA-SANTANTIOCO-2026',
            },
            subject: {
              type: 'string',
              nullable: true,
              example: 'Allegoria della disperazione',
            },
            description: {
              type: 'string',
              nullable: true,
              example: 'Monument with a bronze statue representing a kneeling woman in despair.',
            },
            heritageEntityUri: {
              type: 'string',
              nullable: true,
              example: 'https://data.ocra.echoes.eu/heritage-entity/uc2-lamina',
            },
            graphDate: {
              type: 'string',
              nullable: true,
              example: '2026-06-26',
            },
            projectSnapshotEmbedded: {
              type: 'boolean',
              example: true,
              description: 'Whether this named graph embeds an OCRA snapshot payload.',
            },
          },
        },
        EchoesHdtAsset: {
          type: 'object',
          required: ['assetUri'],
          properties: {
            assetUri: {
              type: 'string',
              example: 'urn:asset:uc2lamina_rti_001',
            },
            label: {
              type: 'string',
              nullable: true,
              example: 'RTI — UC2 Lamina (fronte)',
            },
            title: {
              type: 'string',
              nullable: true,
              example: 'UC2-Lamina-RTI-fronte-20260216',
            },
            description: {
              type: 'string',
              nullable: true,
            },
            source: {
              type: 'string',
              nullable: true,
              example: 'https://vicserver.crs4.it/ocra-assets/uc2_lamina.zip',
            },
            format: {
              type: 'string',
              nullable: true,
              example: 'image/rti',
            },
            linkedHeritageEntityUri: {
              type: 'string',
              nullable: true,
              example: 'https://data.ocra.echoes.eu/heritage-entity/uc2-lamina',
            },
            importable: {
              type: 'boolean',
              example: true,
            },
            importIssue: {
              type: 'string',
              nullable: true,
              example: 'Missing source URL',
            },
          },
        },
        EchoesProjectSnapshotSummary: {
          type: 'object',
          required: ['url', 'format', 'version'],
          properties: {
            url: {
              type: 'string',
              example: 'https://example.org/assets/projects/cmproject123/echoes/project-snapshot-2026-06-26T12-00-00.000Z.json',
            },
            format: {
              type: 'string',
              example: 'application/vnd.ocra.project-snapshot+json',
            },
            version: {
              type: 'integer',
              minimum: 1,
              example: 1,
            },
            exportedAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            checksum: {
              type: 'string',
              nullable: true,
              example: '5c8c4cc4e54b8a0b4c0f0c9baf0d3a7d89a6f0d53c57b671fb0c0f8724c53f1e',
            },
          },
        },
        EchoesEmbeddedProjectMetadata: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              nullable: true,
              example: 'Allegoria della Disperazione - Monumento ai caduti della prima guerra mondiale',
            },
            description: {
              type: 'string',
              nullable: true,
              example: 'Photogrammetric 3D model created for documentation, visual analysis, and scholarly annotation.',
            },
          },
        },
        EchoesHdtDetail: {
          type: 'object',
          required: ['namedGraphUri', 'digitalTwinUri', 'physicalObjectMetadata', 'assets', 'projectSnapshotEmbedded'],
          properties: {
            namedGraphUri: {
              type: 'string',
              example: 'http://echoes-eccch.eu/kb/graph/user-fbettio/1782385399718/2026-06-25',
            },
            digitalTwinUri: {
              type: 'string',
              example: 'http://echoes-eccch.eu/HDT/JGrV52jtL3z',
            },
            digitalTwinLabel: {
              type: 'string',
              nullable: true,
              example: 'HDT UC2 Lamina',
            },
            heritageEntityUri: {
              type: 'string',
              nullable: true,
              example: 'https://data.ocra.echoes.eu/heritage-entity/uc2-lamina',
            },
            physicalObjectMetadata: {
              $ref: '#/components/schemas/PhysicalObjectMetadata',
            },
            assets: {
              type: 'array',
              items: { $ref: '#/components/schemas/EchoesHdtAsset' },
            },
            projectSnapshot: {
              allOf: [{ $ref: '#/components/schemas/EchoesProjectSnapshotSummary' }],
              nullable: true,
            },
            projectSnapshotEmbedded: {
              type: 'boolean',
              example: true,
              description:
                'Whether this ECCCH named graph embeds an OCRA snapshot payload that can be used for full project import.',
            },
            embeddedProjectMetadata: {
              allOf: [{ $ref: '#/components/schemas/EchoesEmbeddedProjectMetadata' }],
              nullable: true,
              description:
                'Project name and description embedded in the OCRA snapshot, when available. These describe the OCRA study/project, not the heritage entity metadata.',
            },
          },
        },
        EchoesHdtListResponse: {
          type: 'object',
          required: ['success', 'items'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/EchoesHdtListItem' },
            },
          },
        },
        EchoesNamedGraphListResponse: {
          type: 'object',
          required: ['success', 'items'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/EchoesNamedGraphListItem' },
            },
          },
        },
        EchoesHdtDetailResponse: {
          type: 'object',
          required: ['success', 'item'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            item: {
              $ref: '#/components/schemas/EchoesHdtDetail',
            },
          },
        },
        EchoesCreateProjectRequest: {
          type: 'object',
          required: ['digitalTwinUri'],
          properties: {
            digitalTwinUri: {
              type: 'string',
              example: 'http://echoes-eccch.eu/HDT/JGrV52jtL3z',
            },
            name: {
              type: 'string',
              example: 'UC2 Lamina imported from ECCCH',
            },
            description: {
              type: 'string',
              example: 'Project initialized from ECCCH HC1/HDT data.',
            },
            public: {
              type: 'boolean',
              example: false,
            },
            importMode: {
              type: 'string',
              enum: ['metadata_assets', 'full_project_without_annotations', 'full_project_with_annotations'],
              example: 'full_project_without_annotations',
            },
          },
        },
        EchoesImportedProject: {
          type: 'object',
          required: ['id', 'name', 'description', 'public', 'createdAt', 'updatedAt'],
          properties: {
            id: { type: 'string', example: 'cmproject123' },
            name: { type: 'string', example: 'UC2 Lamina imported from ECCCH' },
            description: { type: 'string', example: 'Project initialized from ECCCH HC1/HDT data.' },
            public: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        EchoesCreateProjectResponse: {
          type: 'object',
          required: ['success', 'project', 'echoes', 'importedAssetCount', 'importedAnnotationCount'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            project: {
              $ref: '#/components/schemas/EchoesImportedProject',
            },
            echoes: {
              $ref: '#/components/schemas/EchoesHdtDetail',
            },
            importedAssetCount: {
              type: 'integer',
              minimum: 0,
              example: 1,
            },
            importedAnnotationCount: {
              type: 'integer',
              minimum: 0,
              example: 12,
            },
          },
        },
        EchoesProjectStatus: {
          type: 'object',
          required: ['projectId', 'projectUri', 'origin', 'syncStatus', 'assetCount'],
          properties: {
            projectId: { type: 'string', example: 'cmproject123' },
            projectUri: { type: 'string', example: 'http://echoes-eccch.eu/project/ECHOES' },
            origin: { type: 'string', enum: ['local', 'imported'], example: 'local' },
            syncStatus: { type: 'string', enum: ['local', 'registered', 'synced', 'dirty'], example: 'registered' },
            heritageEntityUri: { type: 'string', nullable: true },
            digitalTwinUri: { type: 'string', nullable: true },
            namedGraphUri: { type: 'string', nullable: true },
            digitalTwinLabel: { type: 'string', nullable: true },
            assetCount: { type: 'integer', minimum: 0, example: 1 },
            lastRegisteredAt: { type: 'string', format: 'date-time', nullable: true },
            lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
            projectSnapshot: {
              allOf: [{ $ref: '#/components/schemas/EchoesProjectSnapshotSummary' }],
              nullable: true,
            },
            readiness: { $ref: '#/components/schemas/EchoesProjectReadiness' },
          },
        },
        EchoesReadinessIssue: {
          type: 'object',
          required: ['code', 'severity', 'message', 'field'],
          properties: {
            code: { type: 'string', example: 'missing_asset_source_url' },
            severity: { type: 'string', enum: ['required', 'recommended'], example: 'required' },
            message: { type: 'string', example: 'Digital asset "Model A" is missing its permanent public asset URL.' },
            field: { type: 'string', example: 'digitalAssets.asset_123.metadata.sourceUrl' },
            assetId: { type: 'string', nullable: true, example: 'asset_123' },
            assetLabel: { type: 'string', nullable: true, example: 'Model A' },
          },
        },
        EchoesProjectReadiness: {
          type: 'object',
          required: ['canRegister', 'canPublish', 'requiredIssues', 'recommendedIssues'],
          properties: {
            canRegister: { type: 'boolean', example: true },
            canPublish: { type: 'boolean', example: false },
            requiredIssues: {
              type: 'array',
              items: { $ref: '#/components/schemas/EchoesReadinessIssue' },
            },
            recommendedIssues: {
              type: 'array',
              items: { $ref: '#/components/schemas/EchoesReadinessIssue' },
            },
          },
        },
        EchoesProjectStatusResponse: {
          type: 'object',
          required: ['success', 'status'],
          properties: {
            success: { type: 'boolean', example: true },
            status: { $ref: '#/components/schemas/EchoesProjectStatus' },
          },
        },
        EchoesRegisterProjectResponse: {
          type: 'object',
          required: ['success', 'status'],
          properties: {
            success: { type: 'boolean', example: true },
            status: { $ref: '#/components/schemas/EchoesProjectStatus' },
          },
        },
        EchoesPublishRdfInfo: {
          type: 'object',
          required: ['contentType', 'size'],
          properties: {
            contentType: { type: 'string', example: 'application/rdf+xml' },
            size: { type: 'integer', minimum: 0, example: 2481 },
          },
        },
        EchoesPublishProjectResponse: {
          type: 'object',
          required: ['success', 'status', 'rdf'],
          properties: {
            success: { type: 'boolean', example: true },
            status: { $ref: '#/components/schemas/EchoesProjectStatus' },
            rdf: { $ref: '#/components/schemas/EchoesPublishRdfInfo' },
          },
        },
        EchoesDuplicateProjectRequest: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              example: 'HDT UC2 Lamina Demo Copy',
            },
            description: {
              type: 'string',
              example: 'Duplicated from the current OCRA project for demo purposes.',
            },
            identifier: {
              type: 'string',
              example: 'UC2-LAMINA-DEMO-COPY-2026',
            },
            heritageEntityUri: {
              type: 'string',
              example: 'https://data.ocra.echoes.eu/heritage-entity/uc2-lamina-demo-copy',
            },
          },
        },
        EchoesDevBearerRequest: {
          type: 'object',
          required: ['bearer'],
          properties: {
            bearer: {
              type: 'string',
              example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
            },
          },
        },
        EchoesDeleteDigitalTwinRequest: {
          type: 'object',
          required: ['digitalTwinUri'],
          properties: {
            digitalTwinUri: {
              type: 'string',
              example: 'http://echoes-eccch.eu/HDT/F66u7vEPT35z',
            },
          },
        },
        EchoesDeleteDigitalTwinResponse: {
          type: 'object',
          required: ['success', 'digitalTwinUri', 'deletedNamedGraphUris', 'disconnectedProjectIds', 'message'],
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            digitalTwinUri: {
              type: 'string',
              example: 'http://echoes-eccch.eu/HDT/F66u7vEPT35z',
            },
            deletedNamedGraphUris: {
              type: 'array',
              items: {
                type: 'string',
              },
              example: [
                'http://echoes-eccch.eu/kb/graph/user-fbettio/1782458510131/2026-06-26',
              ],
            },
            disconnectedProjectIds: {
              type: 'array',
              items: {
                type: 'string',
              },
              example: ['cmproject123'],
            },
            message: {
              type: 'string',
              example: '1 ECCCH named graph deleted, then Digital Twin <http://echoes-eccch.eu/HDT/F66u7vEPT35z> unregistered from ECCCH.',
            },
          },
        },
        SceneEnvironmentSettings: {
          type: 'object',
          additionalProperties: false,
          properties: {
            backgroundColor: { type: 'string', example: '#404040' },
            background: { type: 'string', example: '#404040' },
            showGround: { type: 'boolean', example: true },
            groundColor: { type: 'string', example: '#808080' },
            ambientLight: { type: 'number', example: 0.6 },
            directionalLight: {
              type: 'object',
              additionalProperties: false,
              properties: {
                intensity: { type: 'number', example: 1 },
                position: { $ref: '#/components/schemas/Vector3' },
              },
            },
            headLightOffset: {
              $ref: '#/components/schemas/Vector2',
            },
          },
        },
        ViewerAnnotationGeometry: {
          oneOf: [
            { $ref: '#/components/schemas/Vector3' },
            {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/Vector3' },
            },
          ],
        },
        ViewerAnnotation: {
          type: 'object',
          required: ['id', 'label', 'type', 'geometry'],
          properties: {
            id: { type: 'string', example: 'ann-01' },
            label: { type: 'string', example: 'North facade detail' },
            type: { type: 'string', enum: ['point', 'line', 'area'] },
            geometry: {
              $ref: '#/components/schemas/ViewerAnnotationGeometry',
            },
            createdAt: { type: 'string', format: 'date-time' },
            createdBy: { type: 'string' },
            description: { type: 'string' },
          },
        },
        ModelMaterialOverride: {
          type: 'object',
          additionalProperties: false,
          properties: {
            color: { type: 'string', example: '#d9d9d9' },
            metalness: { type: 'number', example: 0.2 },
            roughness: { type: 'number', example: 0.8 },
            flatShading: { type: 'boolean', example: false },
          },
        },
        ModelDefinition: {
          type: 'object',
          required: ['id', 'file'],
          properties: {
            id: { type: 'string', example: 'asset_main' },
            file: { type: 'string', example: 'model.glb' },
            title: { type: 'string', example: 'Main model' },
            position: { $ref: '#/components/schemas/Vector3' },
            rotation: { $ref: '#/components/schemas/Vector3' },
            rotationUnits: { type: 'string', enum: ['deg', 'rad'], example: 'deg' },
            scale: { $ref: '#/components/schemas/ScaleVector' },
            visible: { type: 'boolean', example: true },
            material: { $ref: '#/components/schemas/ModelMaterialOverride' },
          },
        },
        SceneDescriptionEnvironment: {
          type: 'object',
          additionalProperties: false,
          properties: {
            showGround: { type: 'boolean', example: true },
            background: { type: 'string', example: '#404040' },
            headLightOffset: { $ref: '#/components/schemas/Vector2' },
          },
        },
        SceneDescription: {
          type: 'object',
          required: ['models'],
          properties: {
            projectId: { type: 'string', example: 'cmproject123' },
            models: {
              type: 'array',
              items: { $ref: '#/components/schemas/ModelDefinition' },
            },
            environment: {
              $ref: '#/components/schemas/SceneDescriptionEnvironment',
            },
            enableControls: { type: 'boolean', example: true },
            rotationUnits: { type: 'string', enum: ['deg', 'rad'], example: 'deg' },
            annotations: {
              type: 'array',
              items: { $ref: '#/components/schemas/ViewerAnnotation' },
            },
          },
        },
        DigitalAssetMetadata: {
          type: 'object',
          additionalProperties: true,
          properties: {
            triangles: { type: 'number' },
            vertices: { type: 'number' },
            format: { type: 'string' },
            rtiType: { type: 'string', enum: ['ptm', 'lptm', 'hsh', 'yrbf'] },
            rtiLayout: {
              type: 'string',
              enum: ['image', 'deepzoom', 'deepzoom1px', 'google', 'zoomify', 'iiif', 'iip', 'tarzoom', 'itarzoom'],
            },
            openLimeLayout: {
              type: 'string',
              enum: ['image', 'deepzoom', 'deepzoom1px', 'google', 'zoomify', 'iiif', 'iip', 'tarzoom', 'itarzoom'],
              description: 'OpenLIME layout for directly viewable image assets.',
            },
            zipName: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
            resolution: { type: 'number' },
            duration: { type: 'number' },
            codec: { type: 'string' },
          },
        },
        DigitalAsset: {
          type: 'object',
          required: ['id', 'projectId', 'type', 'label', 'uploadedAt', 'uploadedBy'],
          properties: {
            id: { type: 'string', example: 'asset_1710000000000_abc123xyz' },
            projectId: { type: 'string', example: 'cmproject123' },
            type: { type: 'string', enum: ['3d-model', 'rti', 'image', 'video', 'other'] },
            label: { type: 'string', example: 'Main mesh' },
            title: { type: 'string', example: 'Main mesh acquisition' },
            description: { type: 'string' },
            fileName: { type: 'string', example: 'model.glb' },
            publicUri: { type: 'string' },
            thumbnail: { type: 'string' },
            assetParadata: {
              type: 'object',
              additionalProperties: true,
            },
            entryPointUrl: { type: 'string', example: '/api/projects/cmproject123/files/model.glb' },
            entryPoint: { type: 'string', example: 'model.glb' },
            mimeType: { type: 'string', example: 'model/gltf-binary' },
            entrySize: { type: 'number', example: 1048576 },
            uploadedAt: { type: 'string', format: 'date-time' },
            uploadedBy: { type: 'string', example: 'user_123' },
            metadata: { $ref: '#/components/schemas/DigitalAssetMetadata' },
          },
        },
        DigitalAssetCreate: {
          type: 'object',
          required: ['type', 'label'],
          properties: {
            type: { type: 'string', enum: ['3d-model', 'rti', 'image', 'video', 'other'] },
            label: { type: 'string', example: 'Main mesh' },
            title: { type: 'string' },
            description: { type: 'string' },
            publicUri: { type: 'string' },
            thumbnail: { type: 'string' },
            assetParadata: {
              type: 'object',
              additionalProperties: true,
            },
            entryPointUrl: { type: 'string' },
            entryPoint: { type: 'string' },
            mimeType: { type: 'string' },
            entrySize: { type: 'number' },
            metadata: { $ref: '#/components/schemas/DigitalAssetMetadata' },
          },
        },
        DigitalAssetUpdate: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['3d-model', 'rti', 'image', 'video', 'other'] },
            label: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            fileName: { type: 'string' },
            publicUri: { type: 'string' },
            thumbnail: { type: 'string' },
            assetParadata: {
              type: 'object',
              additionalProperties: true,
            },
            entryPointUrl: { type: 'string' },
            entryPoint: { type: 'string' },
            mimeType: { type: 'string' },
            entrySize: { type: 'number' },
            metadata: { $ref: '#/components/schemas/DigitalAssetMetadata' },
          },
        },
        SceneAssetReference: {
          type: 'object',
          required: ['assetId'],
          properties: {
            assetId: { type: 'string', example: 'asset_1710000000000_abc123xyz' },
            visible: { type: 'boolean', example: true },
            position: { $ref: '#/components/schemas/Vector3' },
            rotation: { $ref: '#/components/schemas/Vector3' },
            scale: { $ref: '#/components/schemas/ScaleVector' },
          },
        },
        SceneAssetReferenceUpdate: {
          type: 'object',
          properties: {
            assetId: { type: 'string', example: 'asset_1710000000000_abc123xyz' },
            visible: { type: 'boolean' },
            position: { $ref: '#/components/schemas/Vector3' },
            rotation: { $ref: '#/components/schemas/Vector3' },
            scale: { $ref: '#/components/schemas/ScaleVector' },
          },
        },
        HDTScene: {
          type: 'object',
          required: ['id', 'label', 'assets'],
          properties: {
            id: { type: 'string', example: 'scene_1710000000000' },
            label: { type: 'string', example: 'Default Scene' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['3D', '2D'] },
            isDefault: { type: 'boolean', example: true },
            assets: {
              type: 'array',
              items: { $ref: '#/components/schemas/SceneAssetReference' },
            },
            environment: {
              $ref: '#/components/schemas/SceneEnvironmentSettings',
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            createdBy: { type: 'string' },
          },
        },
        HDTSceneCreate: {
          type: 'object',
          required: ['label'],
          properties: {
            label: { type: 'string', example: 'North facade' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['3D', '2D'] },
            isDefault: { type: 'boolean' },
            assets: {
              type: 'array',
              items: { $ref: '#/components/schemas/SceneAssetReference' },
            },
            environment: {
              $ref: '#/components/schemas/SceneEnvironmentSettings',
            },
          },
        },
        HDTSceneUpdate: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['3D', '2D'] },
            isDefault: { type: 'boolean' },
            assets: {
              type: 'array',
              items: { $ref: '#/components/schemas/SceneAssetReference' },
            },
            environment: {
              $ref: '#/components/schemas/SceneEnvironmentSettings',
            },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        HDTDocument: {
          type: 'object',
          required: ['projectId', 'physicalObjectMetadata', 'digitalAssets', 'scenes'],
          properties: {
            _id: { type: 'string', example: '6845d5d7bcf86cd799439011' },
            projectId: { type: 'string', example: 'cmproject123' },
            physicalObjectMetadata: {
              $ref: '#/components/schemas/PhysicalObjectMetadata',
            },
            echoesContext: {
              $ref: '#/components/schemas/EchoesContext',
            },
            digitalAssets: {
              type: 'array',
              items: { $ref: '#/components/schemas/DigitalAsset' },
            },
            scenes: {
              type: 'array',
              items: { $ref: '#/components/schemas/HDTScene' },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            createdBy: { type: 'string' },
            updatedBy: { type: 'string' },
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
