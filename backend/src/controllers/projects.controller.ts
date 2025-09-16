/**
 * Check if current user is manager of a project
 * GET /api/projects/:projectId/is-manager
 * Returns: { isManager: boolean }
 */
export async function isManagerOfProject(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const db = getPrismaClient();
  const managerRole = await db.role.findUnique({ where: { name: 'manager' } });
  if (!managerRole) {
    return res.status(500).json({ error: 'Manager role not found' });
  }
  const isManager = await db.projectRole.findFirst({
    where: {
      projectId,
      userId: currentUser.sub,
      roleId: managerRole.id
    }
  });
  const result = Boolean(isManager || currentUser.sys_admin);
  res.json({ isManager: result });
}
import path from 'path';
import fs from 'fs';
import multer from 'multer';

// Multer setup for file uploads
const uploadDir = process.env.PROJECT_FILES_PATH || '/app/project_files';
const storage = multer.diskStorage({
  destination: (req: Request, file: any, cb: (error: Error | null, destination: string) => void) => {
    const { projectId } = req.params;
    const projectPath = path.join(uploadDir, projectId);
    fs.mkdirSync(projectPath, { recursive: true });
    cb(null, projectPath);
  },
  filename: (req: Request, file: any, cb: (error: Error | null, filename: string) => void) => {
    cb(null, file.originalname);
  }
});
export const upload = multer({ storage });

/**
 * List files for a project
 * GET /api/projects/:projectId/files
 */
export async function listProjectFiles(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }
  const dir = path.join(uploadDir, projectId);
  try {
    if (!fs.existsSync(dir)) {
      return res.json({ files: [] });
    }
    const files = fs.readdirSync(dir).map(filename => ({
      name: filename,
      url: `/api/projects/${projectId}/files/${encodeURIComponent(filename)}`
    }));
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list files', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Upload a file to a project (manager only)
 * POST /api/projects/:projectId/files
 */
export async function uploadProjectFile(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }
  // Auth: only manager can upload
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const db = getPrismaClient();
  const managerRole = await db.role.findUnique({ where: { name: 'manager' } });
  if (!managerRole) {
    return res.status(500).json({ error: 'Manager role not found' });
  }
  const isManager = await db.projectRole.findFirst({
    where: {
      projectId,
      userId: currentUser.sub,
      roleId: managerRole.id
    }
  });
  if (!isManager && !currentUser.sys_admin) {
    return res.status(403).json({ error: 'Only the project manager can upload files' });
  }
  // File is already saved by multer
  const file = (req as any).file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ success: true, file: file.filename });
}

/**
 * Download a file for a project
 * GET /api/projects/:projectId/files/:filename
 */
export async function downloadProjectFile(req: Request, res: Response) {
  const { projectId, filename } = req.params;
  if (!projectId || !filename) {
    return res.status(400).json({ error: 'Project ID and filename are required' });
  }
  const filePath = path.join(uploadDir, projectId, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath);
}
import { Request, Response } from 'express';
import { getPrismaClient } from '../../db.js';
import { getValidSession } from '../../db.js';

/**
 * PROJECTS CONTROLLER (TypeScript)
 * 
 * Handles project-related API endpoints including listing projects,
 * creating new projects, and managing project data.
 */

/**
 * Get current user from session (if authenticated)
 */
async function getCurrentUser(req: Request): Promise<any | null> {
  console.log('🔐 [getCurrentUser] Starting authentication check...');
  
  try {
    // Get session ID from cookie first, then fall back to header or URL param
    let sessionId = req.cookies?.session_id;
    console.log('🍪 [getCurrentUser] Cookie session_id:', sessionId ? 'Present' : 'Missing');
    
    // Fallback: check Authorization header
    if (!sessionId && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        sessionId = authHeader.substring(7);
        console.log('🔑 [getCurrentUser] Using Bearer token from Authorization header');
      }
    }
    
    // Fallback: check for session_id in query params
    if (!sessionId && req.query.session_id) {
      sessionId = req.query.session_id as string;
      console.log('🔗 [getCurrentUser] Using session_id from query params');
    }
    
    if (!sessionId) {
      console.log('❌ [getCurrentUser] No session ID found in cookies, headers, or query params');
      return null;
    }

    console.log('🔍 [getCurrentUser] Validating session ID...');
    // Validate session
    const session = await getValidSession(sessionId);
    
    if (session?.user) {
      console.log('✅ [getCurrentUser] Valid session found for user:', {
        sub: session.user.sub,
        email: session.user.email,
        username: session.user.username,
        sys_admin: session.user.sys_admin
      });
      return session.user;
    } else {
      console.log('❌ [getCurrentUser] Invalid or expired session');
      return null;
    }
  } catch (error) {
    console.error('❌ [getCurrentUser] Error during authentication:', error);
    return null;
  }
}

/**
 * Get all projects in the system
 * For authenticated users: show all projects they have access to
 * For unauthenticated users: show only public projects
 */
export async function getAllProjects(req: Request, res: Response): Promise<void> {
  console.log('🚀 [getAllProjects] Request received');
  console.log('📋 [getAllProjects] Headers:', {
    authorization: req.headers.authorization ? 'Present' : 'None',
    cookie: req.headers.cookie ? 'Present' : 'None',
    userAgent: req.headers['user-agent']
  });
  
  try {
    const db = getPrismaClient();
    console.log('✅ [getAllProjects] Database client obtained');
    
    // Check if user is authenticated
    console.log('🔍 [getAllProjects] Checking user authentication...');
    const currentUser = await getCurrentUser(req);
    
    if (currentUser) {
      console.log('👤 [getAllProjects] User authenticated:', {
        sub: currentUser.sub,
        email: currentUser.email,
        username: currentUser.username,
        sys_admin: currentUser.sys_admin
      });
    } else {
      console.log('🚫 [getAllProjects] No authenticated user found');
    }
    
    // Build filter based on authentication status and user privileges
    let whereClause;
    if (currentUser) {
      // Check if user is sysadmin using the sys_admin field
      if (currentUser.sys_admin) {
        console.log('🔑 [getAllProjects] Sysadmin detected - showing ALL projects');
        // For sysadmin: show ALL projects (no filtering)
        whereClause = {};
      } else {
        // Get the actual manager role ID
        const managerRole = await db.role.findUnique({ where: { name: 'manager' } });
        if (!managerRole) {
          res.status(500).json({ error: 'Manager role not found in database' });
          return;
        }
        console.log('👥 [getAllProjects] Regular user - showing public + managed projects');
        // For regular authenticated users: show public projects OR projects they manage
        whereClause = {
          OR: [
            { public: true },
            { 
              projectRoles: {
                some: {
                  userId: currentUser.sub,
                  roleId: managerRole.id
                }
              }
            }
          ]
        };
      }
    } else {
      console.log('🌍 [getAllProjects] Unauthenticated user - showing only public projects');
      // For unauthenticated users: show only public projects
      whereClause = { public: true };
    }
    
    console.log('🔍 [getAllProjects] Database query filter:', JSON.stringify(whereClause, null, 2));
    
    // Get the actual manager role ID
    const managerRole = await db.role.findUnique({ where: { name: 'manager' } });
    if (!managerRole) {
      res.status(500).json({ error: 'Manager role not found in database' });
      return;
    }
    // Get projects with manager information
    const projects = await db.project.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true,
        projectRoles: {
          where: {
            roleId: managerRole.id
          },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                username: true,
                given_name: true,
                family_name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📊 [getAllProjects] Found ${projects.length} projects from database`);
    projects.forEach((project: any, index: number) => {
      console.log(`  ${index + 1}. ${project.name} (public: ${project.public}, manager: ${project.projectRoles[0]?.user?.username || 'none'})`);
    });

    // Transform the data to include manager information more clearly
    console.log('🔄 [getAllProjects] Transforming project data...');
    const projectsWithManagers = projects.map((project: any) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      public: project.public,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      manager: project.projectRoles.length > 0 ? {
        id: project.projectRoles[0].user.id,
        name: project.projectRoles[0].user.name,
        email: project.projectRoles[0].user.email,
        username: project.projectRoles[0].user.username,
        displayName: project.projectRoles[0].user.name || 
                     `${project.projectRoles[0].user.given_name || ''} ${project.projectRoles[0].user.family_name || ''}`.trim() ||
                     project.projectRoles[0].user.username ||
                     'Unknown User'
      } : null
    }));

    console.log(`✅ [getAllProjects] Sending response with ${projectsWithManagers.length} projects`);
    res.json({
      success: true,
      projects: projectsWithManagers
    });
  } catch (error) {
    console.error('❌ [getAllProjects] Error occurred:', error);
    console.error('❌ [getAllProjects] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ 
      error: 'Failed to fetch projects',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get a specific project by ID
 * For authenticated users: can access any project
 * For unauthenticated users: can only access public projects
 */
export async function getProjectById(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    
    if (!projectId) {
      res.status(400).json({
        error: 'Project ID is required'
      });
      return;
    }
    
    const db = getPrismaClient();
    
    // Check if user is authenticated
    const currentUser = await getCurrentUser(req);
    
    // Build filter based on authentication status
    const whereClause = currentUser 
      ? { id: projectId } 
      : { id: projectId, public: true };
    
    // Get the actual manager role ID
    const managerRole = await db.role.findUnique({ where: { name: 'manager' } });
    if (!managerRole) {
      res.status(500).json({ error: 'Manager role not found in database' });
      return;
    }
    const project = await db.project.findUnique({
      where: whereClause,
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true,
        projectRoles: {
          where: {
            roleId: managerRole.id
          },
          select: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                username: true,
                given_name: true,
                family_name: true,
              }
            }
          }
        }
      }
    });
    
    if (!project) {
      res.status(404).json({
        error: 'Project not found'
      });
      return;
    }

    // Transform the project data to include manager information
    const projectWithManager = {
      ...project,
      manager: project.projectRoles.length > 0 ? {
        id: project.projectRoles[0].user.id,
        email: project.projectRoles[0].user.email,
        name: project.projectRoles[0].user.name,
        username: project.projectRoles[0].user.username,
        displayName: project.projectRoles[0].user.name || 
                     project.projectRoles[0].user.username || 
                     project.projectRoles[0].user.email
      } : null,
      projectRoles: undefined // Remove from response
    };

    res.json({
      success: true,
      project: projectWithManager
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ 
      error: 'Failed to fetch project',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Create a new project
 */
export async function createProject(req: Request, res: Response): Promise<void> {
  try {
    const { name, description, public: isPublic } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({
        error: 'Project name is required and must be a non-empty string'
      });
      return;
    }
    
    const db = getPrismaClient();
    
    // Check if a project with this name already exists
    const existingProject = await db.project.findFirst({
      where: { name: name.trim() }
    });
    
    if (existingProject) {
      res.status(409).json({
        error: 'A project with this name already exists'
      });
      return;
    }
    
    const project = await db.project.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        public: Boolean(isPublic) || false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true,
      }
    });
    
    res.status(201).json({
      success: true,
      project
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ 
      error: 'Failed to create project',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Update a project (only allowed for project managers)
 */
export async function updateProject(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;
    const { name, description, public: isPublic, managerId } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({
        error: 'Project name is required and must be a non-empty string'
      });
      return;
    }

    const db = getPrismaClient();
    
    // Check if project exists
    const existingProject = await db.project.findUnique({
      where: { id: projectId }
    });
    
    if (!existingProject) {
      res.status(404).json({
        error: 'Project not found'
      });
      return;
    }
    
    // Check if another project with this name already exists (excluding current project)
    const nameConflict = await db.project.findFirst({
      where: { 
        name: name.trim(),
        NOT: { id: projectId }
      }
    });
    
    if (nameConflict) {
      res.status(409).json({
        error: 'A project with this name already exists'
      });
      return;
    }

    // If managerId is provided, verify the user exists
    if (managerId) {
      const managerUser = await db.user.findUnique({
        where: { id: managerId }
      });
      
      if (!managerUser) {
        res.status(400).json({
          error: 'Selected manager user not found'
        });
        return;
      }
    }

    // Update the project
    const updatedProject = await db.project.update({
      where: { id: projectId },
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        public: isPublic !== undefined ? Boolean(isPublic) : undefined,
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    // Handle manager role assignment if managerId is provided
    if (managerId !== undefined) {
      // Get the actual manager role ID
      const managerRole = await db.role.findUnique({ where: { name: 'manager' } });
      if (!managerRole) {
        res.status(500).json({ error: 'Manager role not found in database' });
        return;
      }
      // Remove existing manager role (if any)
      await db.projectRole.deleteMany({
        where: {
          projectId: projectId,
          roleId: managerRole.id
        }
      });

      // If managerId is provided (not null), assign new manager
      if (managerId) {
        await db.projectRole.create({
          data: {
            userId: managerId,
            projectId: projectId,
            roleId: managerRole.id
          }
        });
      }
    }

    res.json({
      success: true,
      project: updatedProject
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ 
      error: 'Failed to update project',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}