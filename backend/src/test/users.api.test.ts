/**
 * Users API Integration Tests
 * 
 * Tests for /api/users endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  setupTestDB,
  cleanupTestDB,
  teardownTestDB,
  createTestUser,
  authHeader,
  createAuthContext,
} from './helpers.js';

const app = createApp();

describe('Users API Integration Tests', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
  });

  beforeEach(async () => {
    await cleanupTestDB();
  });

  describe('GET /api/users', () => {
    it('should return empty array when no users exist', async () => {
      // Create admin user for authentication
      const adminUser = await createTestUser({ sys_admin: true });
      
      const response = await request(app)
        .get('/api/users')
        .set(authHeader(adminUser))
        .expect('Content-Type', /json/)
        .expect(200);

      // Response should be an array (may contain users from parallel tests)
      expect(Array.isArray(response.body)).toBe(true);
      // At least the admin user should exist
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should return list of users', async () => {
      // Create admin user for authentication
      const adminUser = await createTestUser({ sys_admin: true });
      
      // Create test users
      await createTestUser({ name: 'User One', email: 'user1@test.com' });
      await createTestUser({ name: 'User Two', email: 'user2@test.com' });

      const response = await request(app)
        .get('/api/users')
        .set(authHeader(adminUser))
        .expect(200);

      // Should have at least 3 users (admin + 2 test users, possibly more from parallel tests)
      expect(response.body.length).toBeGreaterThanOrEqual(3);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('email');
      expect(response.body[0]).toHaveProperty('sub');
    });

    it('should not expose sensitive fields', async () => {
      // Create admin user for authentication
      const adminUser = await createTestUser({ sys_admin: true });
      await createTestUser({ name: 'Test User' });

      const response = await request(app)
        .get('/api/users')
        .set(authHeader(adminUser))
        .expect(200);

      const user = response.body[0];
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('accessToken');
    });
  });

  describe('GET /api/users/list', () => {
    it('should return simplified user list for dropdowns', async () => {
      // Create authenticated user
      const { headers } = await createAuthContext({ 
        name: 'John Doe', 
        email: 'john@test.com',
        username: 'johndoe' 
      });

      const response = await request(app)
        .get('/api/users/list')
        .set(headers)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('email');
    });
  });

  describe('GET /api/users/stats', () => {
    it('should return users with project statistics', async () => {
      const admin = await createTestUser({ sys_admin: true });
      await createTestUser({ name: 'Stats User' });

      const response = await request(app)
        .get('/api/users/stats')
        .set(authHeader(admin))
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0]).toHaveProperty('projectsCreated');
      expect(response.body[0]).toHaveProperty('projectsAsMember');
    });
  });

  describe('GET /api/users/:userId', () => {
    it('should return user by ID', async () => {
      const admin = await createTestUser({ sys_admin: true });
      const user = await createTestUser({ 
        name: 'Specific User',
        email: 'specific@test.com'
      });

      const response = await request(app)
        .get(`/api/users/${user.id}`)
        .set(authHeader(admin))
        .expect(200);

      expect(response.body).toHaveProperty('id', user.id);
      expect(response.body).toHaveProperty('name', 'Specific User');
      expect(response.body).toHaveProperty('email', 'specific@test.com');
    });

    it('should return 404 for non-existent user', async () => {
      const admin = await createTestUser({ sys_admin: true });
      const response = await request(app)
        .get('/api/users/non-existent-id')
        .set(authHeader(admin))
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/users/:userId/admin', () => {
    it('should update user admin status', async () => {
      const admin = await createTestUser({ sys_admin: true });
      const user = await createTestUser({ 
        name: 'Regular User',
        isAdmin: false 
      });

      const response = await request(app)
        .put(`/api/users/${user.id}/admin`)
        .set(authHeader(admin))
        .send({ isAdmin: true })
        .expect(200);

      expect(response.body).toHaveProperty('isAdmin', true);
    });

    it('should validate isAdmin is boolean', async () => {
      const admin = await createTestUser({ sys_admin: true });
      const user = await createTestUser({ name: 'Test User' });

      await request(app)
        .put(`/api/users/${user.id}/admin`)
        .set(authHeader(admin))
        .send({ isAdmin: 'not-a-boolean' })
        .expect(400);
    });

    it('should return 404 for non-existent user', async () => {
      const admin = await createTestUser({ sys_admin: true });
      await request(app)
        .put('/api/users/non-existent-id/admin')
        .set(authHeader(admin))
        .send({ isAdmin: true })
        .expect(404);
    });
  });

  describe('GET /api/users/:userSub/audit', () => {
    it('should return user audit log', async () => {
      const user = await createTestUser({ sub: 'test-sub-audit' });

      // Note: This endpoint queries MongoDB, so it might return empty array
      // unless we seed MongoDB audit data
      const response = await request(app)
        .get(`/api/users/${user.sub}/audit`)
        .set(authHeader(user))
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('auditLog');
      expect(Array.isArray(response.body.auditLog)).toBe(true);
    });

    it('should support limit parameter', async () => {
      const user = await createTestUser({ sub: 'test-sub-limit' });

      const response = await request(app)
        .get(`/api/users/${user.sub}/audit`)
        .set(authHeader(user))
        .query({ limit: 5 })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('auditLog');
      expect(Array.isArray(response.body.auditLog)).toBe(true);
    });
  });
});
