/**
 * Projects API Integration Tests
 * 
 * Tests for /api/projects endpoints (CRUD operations)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs/promises';
import request from 'supertest';
import { StructuringLockState } from '@prisma/client';
import { createApp } from '../app.js';
import {
  setupTestDB,
  cleanupTestDB,
  teardownTestDB,
  createTestUser,
  createTestProject,
  getTestPrisma,
  authHeader,
  authHeaders,
} from './helpers.js';
import { insertHdtDocument, findHdtByProjectId } from '../repositories/hdt.repository.js';
import { insertAnnotationGeometry, findAnnotationGeometriesByProjectId } from '../repositories/annotation-geometry.repository.js';
import { insertAnnotationData, findAnnotationDataByProjectId } from '../repositories/annotation-data.repository.js';
import { insertAnnotationLink, findAnnotationLinksByProjectId } from '../repositories/annotation-link.repository.js';
import { ensureProjectSkeleton, projectModel3dAssetDir, projectRoot } from '../utils/project-static-paths.js';

const app = createApp();

async function grantExclusiveProjectUpdateLock(projectId: string, sessionId: string, userId: string) {
  const prisma = await getTestPrisma();

  await prisma.structuringLock.upsert({
    where: { projectId },
    update: {
      ownerSessionId: sessionId,
      ownerUserId: userId,
      state: StructuringLockState.exclusive,
      operationType: 'project.update',
      operationContext: { projectId },
      releasedAt: null,
      heartbeatExpiresAt: new Date(Date.now() + 60_000),
    },
    create: {
      projectId,
      ownerSessionId: sessionId,
      ownerUserId: userId,
      state: StructuringLockState.exclusive,
      operationType: 'project.update',
      operationContext: { projectId },
      heartbeatExpiresAt: new Date(Date.now() + 60_000),
    },
  });
}

describe('Projects API Integration Tests', () => {
  let testUser: any;
  let adminUser: any;

  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await cleanupTestDB();
    
    // Create test users
    testUser = await createTestUser({ 
      name: 'Project Creator',
      email: 'creator@test.com',
      canCreateProjects: true
    });
    
    adminUser = await createTestUser({ 
      name: 'Admin User',
      email: 'admin@test.com',
      isAdmin: true,
      canCreateProjects: true
    });
  });

  describe('GET /api/projects', () => {
    it('should return empty array when no projects exist', async () => {
      const response = await request(app)
        .get('/api/projects')
        .set(authHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.projects).toEqual([]);
    });

    it('should return list of projects', async () => {
      await createTestProject(testUser.id, { name: 'Project Alpha' });
      await createTestProject(testUser.id, { name: 'Project Beta' });

      const response = await request(app)
        .get('/api/projects')
        .set(authHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.projects).toHaveLength(2);
      expect(response.body.projects[0]).toHaveProperty('name');
      expect(response.body.projects[0]).toHaveProperty('description');
    });

    it('should include creator information', async () => {
      await createTestProject(testUser.id, { name: 'Test Project' });

      const response = await request(app)
        .get('/api/projects')
        .set(authHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.projects[0]).toHaveProperty('name', 'Test Project');
    });
  });

  describe('POST /api/projects', () => {
    it('should create a new project', async () => {
      const projectData = {
        name: 'New Project',
        description: 'Project description',
      };

      const response = await request(app)
        .post('/api/projects')
        .set(authHeader(testUser))
        .send(projectData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('project.id');
      expect(response.body).toHaveProperty('project.name', 'New Project');
      expect(response.body).toHaveProperty('project.description', 'Project description');
      expect(response.body).toHaveProperty('project.manager.id', testUser.id);
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/projects')
        .set(authHeader(testUser))
        .send({ description: 'Missing name' })
        .expect(400);
    });

    it('should reject duplicate project names', async () => {
      const projectData = {
        name: 'Duplicate Project',
        description: 'First',
      };

      await request(app)
        .post('/api/projects')
        .set(authHeader(testUser))
        .send(projectData)
        .expect(201);

      // Allow duplicates for different users or same user
      const secondProject = {
        ...projectData,
        description: 'Second',
      };

      const response = await request(app)
        .post('/api/projects')
        .set(authHeader(testUser))
        .send(secondProject)
        .expect(409);

      expect(response.body).toHaveProperty('code', 'project.name_conflict');
    });
  });

  describe('GET /api/projects/:projectId', () => {
    it('should return project by ID', async () => {
      const project = await createTestProject(testUser.id, {
        name: 'Specific Project',
        description: 'Test description',
      });

      const response = await request(app)
        .get(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('project.id', project.id);
      expect(response.body).toHaveProperty('project.name', 'Specific Project');
      expect(response.body).toHaveProperty('project.description', 'Test description');
    });

    it('should return 404 for non-existent project', async () => {
      await request(app)
        .get('/api/projects/non-existent-id')
        .set(authHeader(testUser))
        .expect(404);
    });

    it('should include manager information', async () => {
      const project = await createTestProject(testUser.id);
      
      // Add member
      const prisma = await getTestPrisma();
      await prisma.projectRole.create({
        data: {
          projectId: project.id,
          userId: adminUser.id,
          role: 'viewer',
        },
      });

      const response = await request(app)
        .get(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('project.manager');
      expect(response.body.project.manager).not.toBeNull();
    });
  });

  describe('PUT /api/projects/:projectId', () => {
    it('should update project', async () => {
      const project = await createTestProject(testUser.id, {
        name: 'Original Name',
        description: 'Original description',
      });
      const sessionId = 'project-update-session';

      await grantExclusiveProjectUpdateLock(project.id, sessionId, testUser.id);

      const updates = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      const response = await request(app)
        .put(`/api/projects/${project.id}`)
        .set(authHeaders(testUser, sessionId))
        .send(updates)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('project.name', 'Updated Name');
      expect(response.body).toHaveProperty('project.description', 'Updated description');
    });

    it('should allow partial updates', async () => {
      const project = await createTestProject(testUser.id, {
        name: 'Project Name',
        description: 'Original description',
      });
      const sessionId = 'project-partial-update-session';

      await grantExclusiveProjectUpdateLock(project.id, sessionId, testUser.id);

      const response = await request(app)
        .put(`/api/projects/${project.id}`)
        .set(authHeaders(testUser, sessionId))
        .send({ description: 'New description only' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('project.name', 'Project Name');
      expect(response.body).toHaveProperty('project.description', 'New description only');
    });

    it('should return 404 for non-existent project', async () => {
      await request(app)
        .put('/api/projects/non-existent-id')
        .set(authHeader(testUser))
        .send({ name: 'Updated' })
        .expect(404);
    });

    it('should reject updates containing counter field', async () => {
      const project = await createTestProject(testUser.id, {
        name: 'Counter Protected Project',
      });
      const sessionId = 'project-counter-protection-session';

      await grantExclusiveProjectUpdateLock(project.id, sessionId, testUser.id);

      const response = await request(app)
        .put(`/api/projects/${project.id}`)
        .set(authHeaders(testUser, sessionId))
        .send({ counter: 42 })
        .expect(400);

      expect(response.body).toHaveProperty('code', 'project.forbidden_body_fields');
    });

    it('should evict non-member leases when a public project becomes private', async () => {
      const project = await createTestProject(testUser.id, {
        name: 'Public Project',
        description: 'Public before private',
        public: true,
      });
      const publicViewer = await createTestUser({ name: 'Public Viewer' });
      const prisma = await getTestPrisma();

      await prisma.projectPresenceLease.create({
        data: {
          leaseKey: 'viewer-session:viewing:-:tab-1',
          projectId: project.id,
          sessionId: 'viewer-session',
          userId: publicViewer.id,
          mode: 'viewing',
          clientInstanceId: 'tab-1',
          lastHeartbeatAt: new Date(),
          heartbeatExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      await prisma.structuringLock.create({
        data: {
          projectId: project.id,
          ownerSessionId: 'manager-session',
          ownerUserId: testUser.id,
          state: StructuringLockState.exclusive,
          operationType: 'project.update',
          operationContext: { projectId: project.id },
          heartbeatExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await request(app)
        .put(`/api/projects/${project.id}`)
        .set(authHeaders(testUser, 'manager-session'))
        .send({ public: false })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('project.public', false);

      const remainingLease = await prisma.projectPresenceLease.findUnique({
        where: { leaseKey: 'viewer-session:viewing:-:tab-1' },
      });
      expect(remainingLease).toBeNull();

      const updatedLock = await prisma.structuringLock.findUnique({
        where: { projectId: project.id },
      });
      expect(updatedLock?.state).toBe(StructuringLockState.exclusive);
    });
  });

  describe('POST /api/projects/:projectId/counter', () => {
    it('should return sequential values starting from 0', async () => {
      const project = await createTestProject(testUser.id, { name: 'Counter Sequence Project' });

      const first = await request(app)
        .post(`/api/projects/${project.id}/counter`)
        .set(authHeader(testUser))
        .expect(200);

      const second = await request(app)
        .post(`/api/projects/${project.id}/counter`)
        .set(authHeader(testUser))
        .expect(200);

      expect(first.body).toHaveProperty('success', true);
      expect(first.body).toHaveProperty('counter', '0');
      expect(second.body).toHaveProperty('counter', '1');
    });

    it('should be atomic under concurrent requests', async () => {
      const project = await createTestProject(testUser.id, { name: 'Counter Atomic Project' });
      const concurrentCalls = 10;

      const responses = await Promise.all(
        Array.from({ length: concurrentCalls }, () =>
          request(app)
            .post(`/api/projects/${project.id}/counter`)
            .set(authHeader(testUser))
        )
      );

      const counters = responses.map((response) => {
        expect(response.status).toBe(200);
        return Number(response.body.counter);
      });

      const uniqueCounters = new Set(counters);

      expect(uniqueCounters.size).toBe(concurrentCalls);
      expect([...uniqueCounters].sort((a, b) => a - b)).toEqual(
        Array.from({ length: concurrentCalls }, (_, i) => i)
      );
    });

    it('should return 403 when user has no access to private project', async () => {
      const project = await createTestProject(testUser.id, {
        name: 'Private Counter Project',
        public: false,
      });
      const outsider = await createTestUser({ name: 'Outsider User' });

      const response = await request(app)
        .post(`/api/projects/${project.id}/counter`)
        .set(authHeader(outsider))
        .expect(403);

      expect(response.body).toHaveProperty('code', 'project.counter_access_denied');
    });
  });

  describe('DELETE /api/projects/:projectId', () => {
    it('should require an owned exclusive structuring lock before deleting a project', async () => {
      const project = await createTestProject(testUser.id);

      await request(app)
        .delete(`/api/projects/${project.id}`)
        .set(authHeaders(testUser, 'delete-without-lock'))
        .expect(409);

      await request(app)
        .get(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
        .expect(200);
    });

    it('should delete project and purge HDT, annotations and files when caller owns the exclusive lock', async () => {
      const project = await createTestProject(testUser.id);
      const prisma = await getTestPrisma();
      const sessionHeaders = authHeaders(testUser, 'delete-project-session');

      await prisma.structuringLock.create({
        data: {
          projectId: project.id,
          ownerSessionId: 'delete-project-session',
          ownerUserId: testUser.id,
          state: StructuringLockState.exclusive,
          operationType: 'project.delete',
          operationContext: { projectId: project.id },
          heartbeatExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      await insertHdtDocument({
        projectId: project.id,
        physicalObjectMetadata: {
          title: 'Delete me',
          dublinCore: {},
          cidocCrm: {},
        },
        digitalAssets: [
          {
            id: 'asset-delete-1',
            projectId: project.id,
            type: '3d-model',
            label: 'Asset delete 1',
            entryPointUrl: '/assets/projects/test/3d-model/asset-delete-1/model.glb',
            uploadedAt: new Date(),
            uploadedBy: testUser.sub,
          },
        ],
        scenes: [
          {
            id: 'scene-delete-1',
            label: 'Scene delete 1',
            description: '',
            isDefault: true,
            assets: [
              {
                assetId: 'asset-delete-1',
                visible: true,
                transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              },
            ],
            createdAt: new Date(),
            createdBy: testUser.sub,
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
        updatedBy: testUser.sub,
      } as any);

      await insertAnnotationGeometry({
        id: 'geom-delete-1',
        projectId: project.id,
        shapes: [{ type: 'ShapePoints', vertices: [[0, 0, 0]] }],
        referenceType: 'scene',
        referenceId: 'scene-delete-1',
        version: 0,
        erasableAt: null,
        erasableBy: null,
        createdAt: new Date().toISOString(),
        createdBy: testUser.id,
        updatedAt: new Date().toISOString(),
        updatedBy: testUser.id,
      } as any);

      await insertAnnotationData({
        id: 'data-delete-1',
        projectId: project.id,
        label: 'Delete note',
        description: '',
        class: null,
        content: { text: 'delete me' },
        visibilityType: 'asset',
        visibilityId: 'asset-delete-1',
        version: 0,
        erasableAt: null,
        erasableBy: null,
        createdAt: new Date().toISOString(),
        createdBy: testUser.id,
        updatedAt: new Date().toISOString(),
        updatedBy: testUser.id,
      } as any);

      await insertAnnotationLink({
        id: 'link-delete-1',
        projectId: project.id,
        geometryId: 'geom-delete-1',
        dataId: 'data-delete-1',
        version: 0,
        erasableAt: null,
        erasableBy: null,
        createdAt: new Date().toISOString(),
        createdBy: testUser.id,
        updatedAt: new Date().toISOString(),
        updatedBy: testUser.id,
      } as any);

      ensureProjectSkeleton(project.id);
      await fs.mkdir(projectModel3dAssetDir(project.id, 'asset-delete-1'), { recursive: true });
      await fs.writeFile(`${projectModel3dAssetDir(project.id, 'asset-delete-1')}/model.glb`, 'mesh');

      await request(app)
        .delete(`/api/projects/${project.id}`)
        .set(sessionHeaders)
        .expect(200);

      await request(app)
        .get(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
        .expect(404);

      expect(await findHdtByProjectId(project.id)).toBeNull();
      expect(await findAnnotationGeometriesByProjectId(project.id)).toEqual([]);
      expect(await findAnnotationDataByProjectId(project.id)).toEqual([]);
      expect(await findAnnotationLinksByProjectId(project.id)).toEqual([]);
      await expect(fs.access(projectRoot(project.id))).rejects.toThrow();
    });

    it('should return 404 for non-existent project', async () => {
      await request(app)
        .delete('/api/projects/non-existent-id')
        .set(authHeader(testUser))
        .expect(404);
    });

    it('should cascade delete project members', async () => {
      const project = await createTestProject(testUser.id);
      
      const prisma = await getTestPrisma();
      await prisma.structuringLock.create({
        data: {
          projectId: project.id,
          ownerSessionId: 'delete-members-session',
          ownerUserId: testUser.id,
          state: StructuringLockState.exclusive,
          operationType: 'project.delete',
          operationContext: { projectId: project.id },
          heartbeatExpiresAt: new Date(Date.now() + 60_000),
        },
      });
      await prisma.projectRole.create({
        data: {
          projectId: project.id,
          userId: adminUser.id,
          role: 'viewer',
        },
      });

      await request(app)
        .delete(`/api/projects/${project.id}`)
        .set(authHeaders(testUser, 'delete-members-session'))
        .expect(200);

      // Verify members are also deleted
      const members = await prisma.projectRole.findMany({
        where: { projectId: project.id },
      });
      expect(members).toHaveLength(0);
    });
  });

  describe('GET /api/projects/:projectId/is-manager', () => {
    it('should return true if user is project creator', async () => {
      const project = await createTestProject(testUser.id);

      const response = await request(app)
        .get(`/api/projects/${project.id}/is-manager`)
        .set(authHeader(testUser))
        .query({ userId: testUser.id })
        .expect(200);

      expect(response.body).toHaveProperty('isManager', true);
    });

    it('should return true if user is manager member', async () => {
      const project = await createTestProject(testUser.id);
      
      const prisma = await getTestPrisma();
      await prisma.projectRole.create({
        data: {
          projectId: project.id,
          userId: adminUser.id,
          role: 'manager',
        },
      });

      const response = await request(app)
        .get(`/api/projects/${project.id}/is-manager`)
        .set(authHeader(adminUser))
        .query({ userId: adminUser.id })
        .expect(200);

      expect(response.body).toHaveProperty('isManager', true);
    });

    it('should return false if user is viewer', async () => {
      const project = await createTestProject(testUser.id);
      const viewerUser = await createTestUser({ name: 'Viewer' });
      
      const prisma = await getTestPrisma();
      await prisma.projectRole.create({
        data: {
          projectId: project.id,
          userId: viewerUser.id,
          role: 'viewer',
        },
      });

      const response = await request(app)
        .get(`/api/projects/${project.id}/is-manager`)
        .set(authHeader(viewerUser))
        .query({ userId: viewerUser.id })
        .expect(200);

      expect(response.body).toHaveProperty('isManager', false);
    });
  });

  describe('GET /api/projects/:projectId/files', () => {
    it('should return empty array when no files exist', async () => {
      const project = await createTestProject(testUser.id);

      const response = await request(app)
        .get(`/api/projects/${project.id}/files`)
        .set(authHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body.files).toEqual([]);
    });

    it('should return 404 for non-existent project', async () => {
      await request(app)
        .get('/api/projects/non-existent-id/files')
        .set(authHeader(testUser))
        .expect(404);
    });
  });
});
