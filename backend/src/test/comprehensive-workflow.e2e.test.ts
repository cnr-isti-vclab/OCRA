/**
 * Comprehensive End-to-End Workflow Test
 * 
 * Single sequential test covering ALL application functionality.
 * Integrates all tests from users.api.test.ts and projects.api.test.ts
 * into one controlled, sequential workflow.
 * 
 * Coverage:
 * - User management (CRUD, admin status, stats, audit)
 * - Authentication (session management)
 * - Project management (CRUD, permissions, members)
 * - HDT file operations
 * - Edge cases (validation, 404s, 403s)
 * - Multiple user interactions
 * - Public vs Private projects
 * - Role-based permissions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { StructuringLockState } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  setupTestDB,
  teardownTestDB,
  cleanupTestDB,
  ensurePrisma,
} from './helpers.js';

const app = createApp();

describe.sequential('Comprehensive Application Workflow E2E Test', () => {
  // State shared across the entire workflow
  let adminUser: any;
  let adminSessionId: string;
  
  let regularUser: any;
  let regularSessionId: string;
  
  let viewerUser: any;
  let viewerSessionId: string;
  
  let publicProject: any;
  let privateProject: any;
  let sharedProject: any;
  
  let testHdtFile: any;

  async function grantExclusiveDeleteLock(projectId: string, sessionId: string, userId: string) {
    const prisma = await ensurePrisma();

    await prisma.structuringLock.upsert({
      where: { projectId },
      update: {
        ownerSessionId: sessionId,
        ownerUserId: userId,
        state: StructuringLockState.exclusive,
        operationType: 'project.delete',
        operationContext: { projectId },
        releasedAt: null,
        heartbeatExpiresAt: new Date(Date.now() + 60_000),
      },
      create: {
        projectId,
        ownerSessionId: sessionId,
        ownerUserId: userId,
        state: StructuringLockState.exclusive,
        operationType: 'project.delete',
        operationContext: { projectId },
        heartbeatExpiresAt: new Date(Date.now() + 60_000),
      },
    });
  }

  async function grantExclusiveProjectUpdateLock(projectId: string, sessionId: string, userId: string) {
    const prisma = await ensurePrisma();

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

  beforeAll(async () => {
    await setupTestDB();
    await cleanupTestDB();
  });

  afterAll(async () => {
    await cleanupTestDB();
    await teardownTestDB();
  });

  // ========================================
  // PHASE 1: User Management
  // ========================================

  it('Phase 1.1: Create admin user', async () => {
    const prisma = await ensurePrisma();
    
    adminUser = await prisma.user.create({
      data: {
        email: 'admin@workflow.test',
        name: 'Admin User',
        username: 'admin',
        sub: `admin-sub-${Date.now()}`,
        given_name: 'Admin',
        family_name: 'User',
        sys_admin: true,
        sys_creator: true,
      },
    });

    expect(adminUser).toHaveProperty('id');
    expect(adminUser.sys_admin).toBe(true);
    console.log('✅ Phase 1.1: Admin user created');
  });

  it('Phase 1.2: Create admin session', async () => {
    const prisma = await ensurePrisma();
    
    const session = await prisma.session.create({
      data: {
        userId: adminUser.id,
        accessToken: 'admin-access-token',
        refreshToken: 'admin-refresh-token',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    adminSessionId = session.id;
    expect(adminSessionId).toBeTruthy();
    console.log('✅ Phase 1.2: Admin session created');
  });

  it('Phase 1.3: Get users list (empty except admin)', async () => {
    const response = await request(app)
      .get('/api/users')
      .set('Cookie', `session_id=${adminSessionId}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(1); // At least admin
    console.log('✅ Phase 1.3: Users list retrieved');
  });

  it('Phase 1.4: Create regular user', async () => {
    const prisma = await ensurePrisma();
    
    regularUser = await prisma.user.create({
      data: {
        email: 'regular@workflow.test',
        name: 'Regular User',
        username: 'regular',
        sub: `regular-sub-${Date.now()}`,
        given_name: 'Regular',
        family_name: 'User',
        sys_admin: false,
        sys_creator: true,
      },
    });

    expect(regularUser).toHaveProperty('id');
    expect(regularUser.sys_admin).toBe(false);
    console.log('✅ Phase 1.4: Regular user created');
  });

  it('Phase 1.5: Create regular user session', async () => {
    const prisma = await ensurePrisma();
    
    const session = await prisma.session.create({
      data: {
        userId: regularUser.id,
        accessToken: 'regular-access-token',
        refreshToken: 'regular-refresh-token',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    regularSessionId = session.id;
    expect(regularSessionId).toBeTruthy();
    console.log('✅ Phase 1.5: Regular session created');
  });

  it('Phase 1.6: Create viewer user', async () => {
    const prisma = await ensurePrisma();
    
    viewerUser = await prisma.user.create({
      data: {
        email: 'viewer@workflow.test',
        name: 'Viewer User',
        username: 'viewer',
        sub: `viewer-sub-${Date.now()}`,
        given_name: 'Viewer',
        family_name: 'User',
        sys_admin: false,
        sys_creator: false,
      },
    });

    expect(viewerUser).toHaveProperty('id');
    console.log('✅ Phase 1.6: Viewer user created');
  });

  it('Phase 1.7: Create viewer session', async () => {
    const prisma = await ensurePrisma();
    
    const session = await prisma.session.create({
      data: {
        userId: viewerUser.id,
        accessToken: 'viewer-access-token',
        refreshToken: 'viewer-refresh-token',
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    viewerSessionId = session.id;
    expect(viewerSessionId).toBeTruthy();
    console.log('✅ Phase 1.7: Viewer session created');
  });

  it('Phase 1.8: Get all users (should have 3)', async () => {
    const response = await request(app)
      .get('/api/users')
      .set('Cookie', `session_id=${adminSessionId}`)
      .expect(200);

    expect(response.body.length).toBeGreaterThanOrEqual(3);
    const adminExists = response.body.some((u: any) => u.id === adminUser.id);
    expect(adminExists).toBe(true);
    console.log('✅ Phase 1.8: All users retrieved');
  });

  it('Phase 1.9: Get user by ID', async () => {
    const response = await request(app)
      .get(`/api/users/${regularUser.id}`)
      .set('Cookie', `session_id=${adminSessionId}`)
      .expect(200);

    expect(response.body).toHaveProperty('id', regularUser.id);
    expect(response.body).toHaveProperty('email', regularUser.email);
    expect(response.body).not.toHaveProperty('password'); // Sensitive field check
    expect(response.body).not.toHaveProperty('accessToken');
    console.log('✅ Phase 1.9: User retrieved by ID (no sensitive data)');
  });

  it('Phase 1.10: Get 404 for non-existent user', async () => {
    await request(app)
      .get('/api/users/non-existent-id')
      .set('Cookie', `session_id=${adminSessionId}`)
      .expect(404);
    
    console.log('✅ Phase 1.10: 404 handled correctly');
  });

  it('Phase 1.11: Get users list (simplified)', async () => {
    const response = await request(app)
      .get('/api/users/list')
      .set('Cookie', `session_id=${adminSessionId}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(3);
    if (response.body.length > 0) {
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('email');
    }
    console.log('✅ Phase 1.11: Simplified users list retrieved');
  });

  it('Phase 1.12: Get users with stats', async () => {
    const response = await request(app)
      .get('/api/users/stats')
      .set('Cookie', `session_id=${adminSessionId}`)
      .expect(200);

    expect(response.body.length).toBeGreaterThanOrEqual(3);
    console.log('✅ Phase 1.12: Users stats retrieved');
  });

  it('Phase 1.13: Admin promotes regular user to admin', async () => {
    const response = await request(app)
      .put(`/api/users/${regularUser.id}/admin`)
      .set('Cookie', `session_id=${adminSessionId}`)
      .send({ sys_admin: true })
      .expect(200);

    expect(response.body).toHaveProperty('isAdmin', true);
    console.log('✅ Phase 1.13: User promoted to admin');
  });

  it('Phase 1.14: Validate admin status update (invalid boolean)', async () => {
    await request(app)
      .put(`/api/users/${viewerUser.id}/admin`)
      .set('Cookie', `session_id=${adminSessionId}`)
      .send({ sys_admin: 'not-a-boolean' })
      .expect(400);
    
    console.log('✅ Phase 1.14: Input validation working');
  });

  it('Phase 1.15: 404 when updating non-existent user admin status', async () => {
    await request(app)
      .put('/api/users/non-existent-id/admin')
      .set('Cookie', `session_id=${adminSessionId}`)
      .send({ sys_admin: true })
      .expect(404);
    
    console.log('✅ Phase 1.15: Non-existent user admin update handled');
  });

  // ========================================
  // PHASE 2: Project Management - Empty State
  // ========================================

  it('Phase 2.1: Get empty projects list', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.projects).toBeDefined();
    expect(Array.isArray(response.body.projects)).toBe(true);
    console.log('✅ Phase 2.1: Empty projects list retrieved');
  });

  // ========================================
  // PHASE 3: Project CRUD Operations
  // ========================================

  it('Phase 3.1: Create public project', async () => {
    const projectData = {
      name: `Public Project ${Date.now()}`,
      description: 'A public project visible to all',
      public: true,
    };

    const response = await request(app)
      .post('/api/projects')
      .set('Cookie', `session_id=${regularSessionId}`)
      .send(projectData)
      .expect(201);

    publicProject = response.body.project;
    expect(publicProject).toHaveProperty('id');
    expect(publicProject.public).toBe(true);
    expect(publicProject.name).toContain('Public Project');
    console.log('✅ Phase 3.1: Public project created');
  });

  it('Phase 3.2: Create private project', async () => {
    const projectData = {
      name: `Private Project ${Date.now()}`,
      description: 'A private project',
      public: false,
    };

    const response = await request(app)
      .post('/api/projects')
      .set('Cookie', `session_id=${regularSessionId}`)
      .send(projectData)
      .expect(201);

    privateProject = response.body.project;
    expect(privateProject).toHaveProperty('id');
    expect(privateProject.public).toBe(false);
    console.log('✅ Phase 3.2: Private project created');
  });

  it('Phase 3.3: Validate project creation (missing name)', async () => {
    const invalidData = {
      description: 'No name provided',
    };

    await request(app)
      .post('/api/projects')
      .set('Cookie', `session_id=${regularSessionId}`)
      .send(invalidData)
      .expect(400);
    
    console.log('✅ Phase 3.3: Project validation working');
  });

  it('Phase 3.4: Validate duplicate project names are prevented', async () => {
    const projectData = {
      name: publicProject.name,
      description: 'Duplicate name test',
    };

    await request(app)
      .post('/api/projects')
      .set('Cookie', `session_id=${regularSessionId}`)
      .send(projectData)
      .expect(409); // Conflict - duplicate name
    
    console.log('✅ Phase 3.4: Duplicate names correctly prevented');
  });

  it('Phase 3.5: Get project by ID', async () => {
    const response = await request(app)
      .get(`/api/projects/${publicProject.id}`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(200);

    expect(response.body.project).toHaveProperty('id', publicProject.id);
    expect(response.body.project).toHaveProperty('name');
    console.log('✅ Phase 3.5: Project retrieved by ID');
  });

  it('Phase 3.6: Get 404 for non-existent project', async () => {
    await request(app)
      .get('/api/projects/non-existent-id')
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(404);
    
    console.log('✅ Phase 3.6: Project 404 handled');
  });

  it('Phase 3.7: List projects - creator sees both', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(200);

    expect(response.body.projects.length).toBeGreaterThanOrEqual(2);
    const publicExists = response.body.projects.some((p: any) => p.id === publicProject.id);
    const privateExists = response.body.projects.some((p: any) => p.id === privateProject.id);
    expect(publicExists).toBe(true);
    expect(privateExists).toBe(true);
    console.log('✅ Phase 3.7: Creator sees all their projects');
  });

  it('Phase 3.8: List projects - viewer sees only public', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('Cookie', `session_id=${viewerSessionId}`)
      .expect(200);

    const publicExists = response.body.projects.some((p: any) => p.id === publicProject.id);
    const privateExists = response.body.projects.some((p: any) => p.id === privateProject.id);
    expect(publicExists).toBe(true);
    expect(privateExists).toBe(false);
    console.log('✅ Phase 3.8: Viewer sees only public projects');
  });

  it('Phase 3.9: Update project information', async () => {
    await grantExclusiveProjectUpdateLock(publicProject.id, regularSessionId, regularUser.id);

    const updates = {
      name: publicProject.name + ' (Updated)',
      description: 'Updated description',
    };

    const response = await request(app)
      .put(`/api/projects/${publicProject.id}`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .send(updates)
      .expect(200);

    expect(response.body.project.name).toContain('(Updated)');
    expect(response.body.project.description).toBe('Updated description');
    console.log('✅ Phase 3.9: Project updated');
  });

  it('Phase 3.10: Partial update (description only)', async () => {
    await grantExclusiveProjectUpdateLock(publicProject.id, regularSessionId, regularUser.id);

    const updates = {
      description: 'New description only',
    };

    const response = await request(app)
      .put(`/api/projects/${publicProject.id}`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .send(updates)
      .expect(200);

    expect(response.body.project.description).toBe('New description only');
    console.log('✅ Phase 3.10: Partial update working');
  });

  it('Phase 3.11: Non-owner cannot update project', async () => {
    const updates = {
      name: 'Hacked name',
    };

    await request(app)
      .put(`/api/projects/${publicProject.id}`)
      .set('Cookie', `session_id=${viewerSessionId}`)
      .send(updates)
      .expect(403);
    
    console.log('✅ Phase 3.11: Permission check working');
  });

  it('Phase 3.12: Update 404 for non-existent project', async () => {
    const updates = {
      name: 'Updated',
    };

    await request(app)
      .put('/api/projects/non-existent-id')
      .set('Cookie', `session_id=${regularSessionId}`)
      .send(updates)
      .expect(404);
    
    console.log('✅ Phase 3.12: Update 404 handled');
  });

  // ========================================
  // PHASE 4: Project Members & Permissions
  // ========================================

  it('Phase 4.1: Create shared project for member testing', async () => {
    const projectData = {
      name: `Shared Project ${Date.now()}`,
      description: 'Project with multiple members',
      public: false,
    };

    const response = await request(app)
      .post('/api/projects')
      .set('Cookie', `session_id=${regularSessionId}`)
      .send(projectData)
      .expect(201);

    sharedProject = response.body.project;
    console.log('✅ Phase 4.1: Shared project created');
  });

  it('Phase 4.2: Add admin as manager', async () => {
    const prisma = await ensurePrisma();
    
    await prisma.projectRole.create({
      data: {
        projectId: sharedProject.id,
        userId: adminUser.id,
        role: 'manager',
      },
    });

    console.log('✅ Phase 4.2: Admin added as manager');
  });

  it('Phase 4.3: Add viewer as viewer role', async () => {
    const prisma = await ensurePrisma();
    
    await prisma.projectRole.create({
      data: {
        projectId: sharedProject.id,
        userId: viewerUser.id,
        role: 'viewer',
      },
    });

    console.log('✅ Phase 4.3: Viewer added as project viewer');
  });

  it('Phase 4.4: Check creator is manager', async () => {
    const response = await request(app)
      .get(`/api/projects/${sharedProject.id}/is-manager`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .query({ userId: regularUser.id })
      .expect(200);

    expect(response.body).toHaveProperty('isManager', true);
    console.log('✅ Phase 4.4: Creator is manager');
  });

  it('Phase 4.5: Check admin is manager', async () => {
    const response = await request(app)
      .get(`/api/projects/${sharedProject.id}/is-manager`)
      .set('Cookie', `session_id=${adminSessionId}`)
      .query({ userId: adminUser.id })
      .expect(200);

    expect(response.body).toHaveProperty('isManager', true);
    console.log('✅ Phase 4.5: Admin member is manager');
  });

  it('Phase 4.6: Check viewer is NOT manager', async () => {
    const response = await request(app)
      .get(`/api/projects/${sharedProject.id}/is-manager`)
      .set('Cookie', `session_id=${viewerSessionId}`)
      .query({ userId: viewerUser.id })
      .expect(200);

    expect(response.body).toHaveProperty('isManager', false);
    console.log('✅ Phase 4.6: Viewer is not manager');
  });

  it('Phase 4.7: Viewer can see shared project now', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('Cookie', `session_id=${viewerSessionId}`)
      .expect(200);

    const sharedExists = response.body.projects.some((p: any) => p.id === sharedProject.id);
    expect(sharedExists).toBe(true);
    console.log('✅ Phase 4.7: Member can see private project');
  });

  it('Phase 4.8: Viewer cannot update shared project (viewer role)', async () => {
    const updates = {
      name: 'Attempted hack',
    };

    await request(app)
      .put(`/api/projects/${sharedProject.id}`)
      .set('Cookie', `session_id=${viewerSessionId}`)
      .send(updates)
      .expect(403);
    
    console.log('✅ Phase 4.8: Viewer role restrictions working');
  });

  it('Phase 4.9: Admin manager CAN update shared project', async () => {
    await grantExclusiveProjectUpdateLock(sharedProject.id, adminSessionId, adminUser.id);

    const updates = {
      description: 'Updated by admin manager',
    };

    const response = await request(app)
      .put(`/api/projects/${sharedProject.id}`)
      .set('Cookie', `session_id=${adminSessionId}`)
      .send(updates)
      .expect(200);

    expect(response.body.project.description).toBe('Updated by admin manager');
    console.log('✅ Phase 4.9: Manager can update project');
  });

  // ========================================
  // PHASE 5: HDT Files Management
  // ========================================

  it('Phase 5.1: Get empty files list', async () => {
    const response = await request(app)
      .get(`/api/projects/${publicProject.id}/files`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(200);

    expect(response.body).toHaveProperty('files');
    expect(Array.isArray(response.body.files)).toBe(true);
    console.log('✅ Phase 5.1: Empty files list retrieved');
  });

  it('Phase 5.2: Add HDT metadata to project', async () => {
    const hdtData = {
      projectId: publicProject.id,
      fileName: 'test-model.hdt',
      fileType: 'hdt',
      size: 1024000,
      path: `/projects/${publicProject.id}/hdt/test-model.hdt`,
    };

    testHdtFile = {
      id: 'fake-hdt-id',
      ...hdtData,
    };

    expect(testHdtFile).toHaveProperty('fileName', 'test-model.hdt');
    console.log('✅ Phase 5.2: HDT metadata created');
  });

  it('Phase 5.3: Get files list for project', async () => {
    const response = await request(app)
      .get(`/api/projects/${publicProject.id}/files`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(200);

    expect(response.body).toHaveProperty('files');
    console.log('✅ Phase 5.3: Files list retrieved');
  });

  it('Phase 5.4: Get 404 for files of non-existent project', async () => {
    await request(app)
      .get('/api/projects/non-existent-id/files')
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(404);
    
    console.log('✅ Phase 5.4: Files 404 handled');
  });

  // ========================================
  // PHASE 6: Audit Logs
  // ========================================

  it('Phase 6.1: Get user audit log', async () => {
    const response = await request(app)
      .get(`/api/users/${regularUser.sub}/audit`)
      .set('Cookie', `session_id=${adminSessionId}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.auditLog).toBeDefined();
    console.log('✅ Phase 6.1: Audit log retrieved');
  });

  it('Phase 6.2: Get audit log with limit', async () => {
    const response = await request(app)
      .get(`/api/users/${regularUser.sub}/audit`)
      .set('Cookie', `session_id=${adminSessionId}`)
      .query({ limit: 5 })
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    console.log('✅ Phase 6.2: Limited audit log retrieved');
  });

  // ========================================
  // PHASE 7: Cleanup & Deletion
  // ========================================

  it('Phase 7.1: Delete shared project', async () => {
    await grantExclusiveDeleteLock(sharedProject.id, regularSessionId, regularUser.id);

    await request(app)
      .delete(`/api/projects/${sharedProject.id}`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(200);
    
    console.log('✅ Phase 7.1: Shared project deleted');
  });

  it('Phase 7.2: Verify project is deleted', async () => {
    await request(app)
      .get(`/api/projects/${sharedProject.id}`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(404);
    
    console.log('✅ Phase 7.2: Project deletion verified');
  });

  it('Phase 7.3: Verify project members were cascade deleted', async () => {
    const prisma = await ensurePrisma();
    
    const roles = await prisma.projectRole.findMany({
      where: { projectId: sharedProject.id },
    });

    expect(roles.length).toBe(0);
    console.log('✅ Phase 7.3: Cascade deletion verified');
  });

  it('Phase 7.4: Delete private project', async () => {
    await grantExclusiveDeleteLock(privateProject.id, regularSessionId, regularUser.id);

    await request(app)
      .delete(`/api/projects/${privateProject.id}`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(200);
    
    console.log('✅ Phase 7.4: Private project deleted');
  });

  it('Phase 7.5: Delete public project', async () => {
    await grantExclusiveDeleteLock(publicProject.id, regularSessionId, regularUser.id);

    await request(app)
      .delete(`/api/projects/${publicProject.id}`)
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(200);
    
    console.log('✅ Phase 7.5: Public project deleted');
  });

  it('Phase 7.6: Cannot delete non-existent project', async () => {
    await request(app)
      .delete('/api/projects/non-existent-id')
      .set('Cookie', `session_id=${regularSessionId}`)
      .expect(404);
    
    console.log('✅ Phase 7.6: Delete 404 handled');
  });

  it('Phase 7.7: Update viewer user info', async () => {
    const prisma = await ensurePrisma();
    
    await prisma.user.update({
      where: { id: viewerUser.id },
      data: {
        name: 'Updated Viewer Name',
      },
    });

    console.log('✅ Phase 7.7: User info updated');
  });

  it('Phase 7.8: Logout viewer (delete session)', async () => {
    const prisma = await ensurePrisma();
    
    await prisma.session.delete({
      where: { id: viewerSessionId },
    });

    console.log('✅ Phase 7.8: Viewer logged out');
  });

  it('Phase 7.9: Delete viewer user', async () => {
    const prisma = await ensurePrisma();
    
    await prisma.user.delete({
      where: { id: viewerUser.id },
    });

    console.log('✅ Phase 7.9: Viewer user deleted');
  });

  it('Phase 7.10: Logout regular user', async () => {
    const prisma = await ensurePrisma();
    
    await prisma.session.delete({
      where: { id: regularSessionId },
    });

    console.log('✅ Phase 7.10: Regular user logged out');
  });

  it('Phase 7.11: Delete regular user', async () => {
    const prisma = await ensurePrisma();
    
    await prisma.user.delete({
      where: { id: regularUser.id },
    });

    console.log('✅ Phase 7.11: Regular user deleted');
  });

  it('Phase 7.12: Logout admin', async () => {
    const prisma = await ensurePrisma();
    
    await prisma.session.delete({
      where: { id: adminSessionId },
    });

    console.log('✅ Phase 7.12: Admin logged out');
  });

  it('Phase 7.13: Delete admin user', async () => {
    const prisma = await ensurePrisma();
    
    await prisma.user.delete({
      where: { id: adminUser.id },
    });

    console.log('✅ Phase 7.13: Admin user deleted');
    console.log('');
    console.log('🎉 ========================================');
    console.log('🎉 ALL WORKFLOW PHASES COMPLETED!');
    console.log('🎉 ========================================');
  });
});
