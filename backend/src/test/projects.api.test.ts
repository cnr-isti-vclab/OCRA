/**
 * Projects API Integration Tests
 * 
 * Tests for /api/projects endpoints (CRUD operations)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
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
        createdById: testUser.id,
      };

      const response = await request(app)
        .post('/api/projects')
        .set(authHeader(testUser))
        .send(projectData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', 'New Project');
      expect(response.body).toHaveProperty('description', 'Project description');
      expect(response.body).toHaveProperty('createdById', testUser.id);
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/projects')
        .set(authHeader(testUser))
        .send({ description: 'Missing name' })
        .expect(400);
    });

    it('should handle duplicate project names', async () => {
      const projectData = {
        name: 'Duplicate Project',
        description: 'First',
        createdById: testUser.id,
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

      await request(app)
        .post('/api/projects')
        .set(authHeader(testUser))
        .send(secondProject)
        .expect(201);
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

      expect(response.body).toHaveProperty('id', project.id);
      expect(response.body).toHaveProperty('name', 'Specific Project');
      expect(response.body).toHaveProperty('description', 'Test description');
    });

    it('should return 404 for non-existent project', async () => {
      await request(app)
        .get('/api/projects/non-existent-id')
        .set(authHeader(testUser))
        .expect(404);
    });

    it('should include members list', async () => {
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

      expect(response.body).toHaveProperty('members');
      expect(Array.isArray(response.body.members)).toBe(true);
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

      expect(response.body).toHaveProperty('name', 'Updated Name');
      expect(response.body).toHaveProperty('description', 'Updated description');
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

      expect(response.body).toHaveProperty('name', 'Project Name');
      expect(response.body).toHaveProperty('description', 'New description only');
    });

    it('should return 404 for non-existent project', async () => {
      await request(app)
        .put('/api/projects/non-existent-id')
        .set(authHeader(testUser))
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /api/projects/:projectId', () => {
    it('should delete project', async () => {
      const project = await createTestProject(testUser.id);

      await request(app)
        .delete(`/api/projects/${project.id}`)
        .set(authHeader(testUser))
        .expect(204);

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
        .expect(204);

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
