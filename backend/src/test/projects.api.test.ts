/**
 * Projects API Integration Tests
 * 
 * Tests for /api/projects endpoints (CRUD operations)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
} from './helpers.js';

const app = createApp();

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

      const updates = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      const response = await request(app)
        .put(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
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

      const response = await request(app)
        .put(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
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
          state: StructuringLockState.draining,
          heartbeatExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      const response = await request(app)
        .put(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
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

  describe('DELETE /api/projects/:projectId', () => {
    it('should delete project', async () => {
      const project = await createTestProject(testUser.id);

      await request(app)
        .delete(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
        .expect(200);

      // Verify project is deleted
      await request(app)
        .get(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
        .expect(404);
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
      await prisma.projectRole.create({
        data: {
          projectId: project.id,
          userId: adminUser.id,
          role: 'viewer',
        },
      });

      await request(app)
        .delete(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
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
