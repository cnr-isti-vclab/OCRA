/**
 * PROJECTS CONTROLLER (TypeScript)
 *
 * Updated for unified project filesystem layout:
 *
 * project_files/
 * └── PROJECT_ID
 *     ├── 3d-model
 *     │   ├── scene.json
 *     │   └── ASSET_ID
 *     │       └── <file>
 *     ├── rti
 *     └── tmp
 *
 * Step 5: 3D upload now goes to tmp/ first, then moved into 3d-model/ASSET_ID/
 */

import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import fse from 'fs-extra';
import multer from 'multer';

import type { PrismaClient } from '@prisma/client';
import { RoleEnum } from '@prisma/client';

import { getPrismaClient } from '../../db.js';
import { getValidSession } from '../../db.js';
import { logAuditEvent } from '../../db.js';

import type { User } from '../types/index.js';

import {
  ensureProjectSkeleton,
  projectRoot,
  projectModel3dDir,
  projectModel3dAssetDir,
  projectTmpDir,
} from '../utils/project-static-paths.js';

import { getHDTDocument } from '../services/hdt-metadata.service.js'

/**
 * Helper: Check if a user is manager of a project (or sysadmin)
 * Returns true if user is manager or sysadmin, false otherwise
 */
async function checkIsManagerOfProject(db: PrismaClient, user: User, projectId: string): Promise<boolean> {
  if (!user || !projectId) return false;
  if (user.sys_admin) return true;

  // user.id may not be present in User type, so fetch by sub
  const dbUser = await db.user.findUnique({ where: { sub: user.sub } });
  if (!dbUser) return false;

  const isManager = await db.projectRole.findFirst({
    where: {
      projectId,
      userId: dbUser.id,
      role: RoleEnum.manager,
    },
  });
  return !!isManager;
}

/**
 * Get current user from session (if authenticated)
 */
async function getCurrentUser(req: Request): Promise<User | null> {
  console.log('🔐 [getCurrentUser] Starting authentication check...');

  try {
    // Get session ID from cookie first, then fall back to header or URL param
    let sessionId = (req as any).cookies?.session_id;
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
    if (!sessionId && (req as any).query?.session_id) {
      sessionId = (req as any).query.session_id as string;
      console.log('🔗 [getCurrentUser] Using session_id from query params');
    }

    if (!sessionId) {
      console.log('❌ [getCurrentUser] No session ID found in cookies, headers, or query params');
      return null;
    }

    console.log('🔍 [getCurrentUser] Validating session ID...');
    const session = await getValidSession(sessionId);

    if (session?.user) {
      // Fetch internal user id from DB using sub
      const db = getPrismaClient();
      const dbUser = await db.user.findUnique({ where: { sub: session.user.sub } });
      if (!dbUser) {
        console.log('❌ [getCurrentUser] No DB user found for sub:', session.user.sub);
        return null;
      }

      // Merge DB id into session user object
      const userWithId: User = { ...session.user, id: dbUser.id };

      console.log('✅ [getCurrentUser] Valid session found for user:', {
        sub: session.user.sub,
        email: session.user.email,
        username: session.user.username,
        sys_admin: session.user.sys_admin,
        id: dbUser.id,
      });

      return userWithId;
    }

    console.log('❌ [getCurrentUser] Invalid or expired session');
    return null;
  } catch (error) {
    console.error('❌ [getCurrentUser] Error during authentication:', error);
    return null;
  }
}

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
  const result = await checkIsManagerOfProject(db, currentUser, projectId);
  res.json({ isManager: result });
}

/**
 * Multer setup for 3D file uploads.
 *
 * IMPORTANT:
 * We store uploaded files in project tmp folder first:
 *   project_files/PROJECT_ID/tmp/<file>
 * then we move them in the controller to:
 *   project_files/PROJECT_ID/3d-model/ASSET_ID/<file>
 *
 * This avoids needing req.body fields (assetId) to decide destination.
 */
const storage = multer.diskStorage({
  destination: (
    req: Request,
    _file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) => {
    const { projectId } = req.params as { projectId?: string };

    if (!projectId) {
      return cb(new Error('Missing projectId in route parameters'), '');
    }

    ensureProjectSkeleton(projectId);
    cb(null, projectTmpDir(projectId));
  },

  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    cb(null, file.originalname);
  },
});

export const upload = multer({ storage });

/**
 * Get scene.json for a project
 * GET /api/projects/:projectId/scene
 *
 * Reads from: project_files/PROJECT_ID/3d-model/scene.json
 */
export async function getProjectScene(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  const scenePath = path.join(projectModel3dDir(projectId), 'scene.json');

  try {
    if (!fs.existsSync(scenePath)) {
      // Return empty scene if file doesn't exist
      return res.json({
        meshes: {},
        modelInstances: {},
        trackball: { type: 'TurntableTrackball' },
        showGround: true,
      });
    }

    const sceneData = fs.readFileSync(scenePath, 'utf-8');
    res.json(JSON.parse(sceneData));
  } catch (error) {
    res.status(500).json({
      error: 'Failed to read scene',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Update scene.json for a project (manager only)
 * PUT /api/projects/:projectId/scene
 *
 * Writes to: project_files/PROJECT_ID/3d-model/scene.json
 */
export async function updateProjectScene(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const db = getPrismaClient();
  const isManager = await checkIsManagerOfProject(db, currentUser, projectId);
  if (!isManager) {
    return res.status(403).json({ error: 'Only project managers can update the scene' });
  }

  try {
    ensureProjectSkeleton(projectId);

    const scenePath = path.join(projectModel3dDir(projectId), 'scene.json');

    const sceneData = req.body;
    fs.writeFileSync(scenePath, JSON.stringify(sceneData, null, 2), 'utf-8');

    res.json({ success: true, scene: sceneData });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to update scene',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Short list of assets in a project
 * GET /api/projects/:projectId/files
 */
export async function listProjectFiles(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    const hdtDoc = await getHDTDocument(projectId);
    const assets = hdtDoc?.digitalAssets || [];

    const files = assets.map(asset => ({
      assetId: asset.id,
      type: asset.type,  // "3d-model" | "rti" | "image" | "video" | "other"[file:2]
      entryPointUrl: asset.entryPointUrl  // URL HDT
    }));

    res.json({ 
      files,
      totalAssets: files.length 
    });
  } catch (error) {
    console.error('Error listing project files:', error);
    res.status(500).json({
      error: 'Failed to list project assets',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Upload a 3D file to a project (manager only)
 * POST /api/projects/:projectId/files
 *
 * Expects multipart/form-data:
 * - file: the 3D file
 * - assetId: the unique ID assigned by /api/projects/:projectId/hdt (required)
 */
export async function uploadProjectFile(req: Request, res: Response) {
  const { projectId } = req.params;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const db = getPrismaClient();
  const isManager = await checkIsManagerOfProject(db, currentUser, projectId);
  if (!isManager) {
    // Audit unauthorized attempt (keep your existing pattern)
    try {
      await logAuditEvent({
        userSub: currentUser.sub,
        eventType: 'file.upload',
        success: false,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || (req.connection as any)?.remoteAddress || null,
        payload: { projectId, error: 'Unauthorized: not project manager' },
      });
    } catch (auditErr) {
      console.warn('Failed to log unauthorized file upload audit event:', auditErr instanceof Error ? auditErr.message : auditErr);
    }

    return res.status(403).json({ error: 'Only the project manager can upload files' });
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    try {
      await logAuditEvent({
        userSub: currentUser.sub,
        eventType: 'file.upload',
        success: false,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || (req.connection as any)?.remoteAddress || null,
        payload: { projectId, error: 'No file uploaded' },
      });
    } catch (auditErr) {
      console.warn('Failed to log failed file upload audit event:', auditErr instanceof Error ? auditErr.message : auditErr);
    }

    return res.status(400).json({ error: 'No file uploaded' });
  }

  const assetIdRaw = (req as any).body?.assetId;
  const assetId = typeof assetIdRaw === 'string' ? assetIdRaw.trim() : '';
  if (!assetId) {
    // Remove tmp file to avoid clutter
    try { await fse.remove(file.path); } catch { }
    return res.status(400).json({ error: 'assetId is required' });
  }

  // Audit success (best-effort)
  try {
    await logAuditEvent({
      userSub: currentUser.sub,
      eventType: 'file.upload',
      success: true,
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip || (req.connection as any)?.remoteAddress || null,
      payload: {
        projectId,
        assetId,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      },
    });
  } catch (auditErr) {
    console.warn('Failed to log file upload audit event:', auditErr instanceof Error ? auditErr.message : auditErr);
  }

  // Finalize upload: move into 3d-model/ASSET_ID and update scene.json
  try {
    ensureProjectSkeleton(projectId);

    const targetDir = projectModel3dAssetDir(projectId, assetId);
    await fse.ensureDir(targetDir);

    const finalPath = path.join(targetDir, file.originalname);
    await fse.move(file.path, finalPath, { overwrite: true });

    const scenePath = path.join(projectModel3dDir(projectId), 'scene.json'); // FIXME

    let scene: any = {
      models: [],
      environment: {
        showGround: true,
        background: '#404040',
      },
      enableControls: true,
    };

    if (fs.existsSync(scenePath)) {
      try {
        scene = JSON.parse(fs.readFileSync(scenePath, 'utf-8'));
        if (!scene.models) scene.models = [];
      } catch {
        // keep default if corrupted
      }
    }

    // Create unique model ID based on filename
    const fileBaseName = file.originalname.replace(/\.[^/.]+$/, '');
    let modelId = fileBaseName;
    let counter = 1;
    while (scene.models.find((m: any) => m.id === modelId)) {
      modelId = `${fileBaseName}_${counter}`;
      counter++;
    }

    // Store file path relative to 3d-model root: ASSET_ID/filename
    const relFile = `${assetId}/${file.originalname}`;

    scene.models.push({
      id: modelId,
      file: relFile,
      title: fileBaseName,
      visible: true,
    });

    fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2), 'utf-8');
    console.log(`✅ Added model ${modelId} (${relFile}) to scene.json for project ${projectId}`);

    res.json({ success: true, projectId, assetId, file: file.originalname });
  } catch (sceneErr: any) {
    console.warn('Failed to finalize upload or update scene.json:', sceneErr?.message ?? String(sceneErr));
    res.status(500).json({
      error: 'Failed to finalize upload',
      message: sceneErr?.message ?? String(sceneErr),
    });
  }
}

/**
 * Download a file for a project
 *
 * Preferred new route:
 *   GET /api/projects/:projectId/files/:assetId/:filename
 *
 * Backward-compatible fallback route (old):
 *   GET /api/projects/:projectId/files/:filename
 * In that case, we search the file under 3d-model filename and return the first match.
 */
export async function downloadProjectFile(req: Request, res: Response) {
  const { projectId } = req.params as { projectId?: string };
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  const paramsAny = req.params as any;
  const assetId: string | undefined = paramsAny.assetId;
  const filename: string | undefined = paramsAny.filename;

  // Case A: new route with assetId + filename
  if (assetId && filename) {
    const filePath = path.join(projectModel3dAssetDir(projectId, assetId), filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.download(filePath);
  }

  // Case B: old route only provides "filename" (Express will map it to req.params.filename)
  const oldFilename = paramsAny.filename || paramsAny[0];
  if (!oldFilename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  // Search in 3d-model/*/oldFilename
  const model3dDir = projectModel3dDir(projectId);
  if (!fs.existsSync(model3dDir)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const entries = fs.readdirSync(model3dDir, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const entry of entries) {
    const candidate = path.join(model3dDir, entry.name, oldFilename);
    if (fs.existsSync(candidate)) {
      return res.download(candidate);
    }
  }

  return res.status(404).json({ error: 'File not found' });
}

/**
 * Delete a file for a project (manager only)
 *
 * Preferred new route:
 *   DELETE /api/projects/:projectId/files/:assetId/:filename
 *
 * Backward-compatible fallback route (old):
 *   DELETE /api/projects/:projectId/files/:filename
 * In that case, we search and delete the first match under 3d-model filename.
 */
export async function deleteProjectFile(req: Request, res: Response) {
  try {
    const { projectId } = req.params as { projectId?: string };
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const db = getPrismaClient();
    const isManager = await checkIsManagerOfProject(db, currentUser, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can delete files' });
    }

    const paramsAny = req.params as any;
    const assetId: string | undefined = paramsAny.assetId;
    const filename: string | undefined = paramsAny.filename;

    // Case A: new route
    if (assetId && filename) {
      const filePath = path.join(projectModel3dAssetDir(projectId, assetId), filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted file: ${filePath}`);
      return res.json({ message: 'File deleted successfully', assetId, filename });
    }

    // Case B: old route (filename only)
    const oldFilename = paramsAny.filename || paramsAny[0];
    if (!oldFilename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const model3dDir = projectModel3dDir(projectId);
    if (!fs.existsSync(model3dDir)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const entries = fs.readdirSync(model3dDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const entry of entries) {
      const candidate = path.join(model3dDir, entry.name, oldFilename);
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
        console.log(`🗑️ Deleted file (fallback): ${candidate}`);
        return res.json({ message: 'File deleted successfully', assetId: entry.name, filename: oldFilename });
      }
    }

    return res.status(404).json({ error: 'File not found' });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      message: error?.message || String(error),
    });
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
    cookie: (req.headers as any).cookie ? 'Present' : 'None',
    userAgent: req.headers['user-agent'],
  });

  try {
    const db = getPrismaClient();
    console.log('✅ [getAllProjects] Database client obtained');

    const currentUser = await getCurrentUser(req);

    let whereClause: any;
    if (currentUser) {
      if (currentUser.sys_admin) {
        console.log('🔑 [getAllProjects] Sysadmin detected - showing ALL projects');
        whereClause = {};
      } else {
        console.log('👥 [getAllProjects] Regular user - showing public + visible projects (manager/editor/viewer)');
        const dbUser = await db.user.findUnique({ where: { sub: currentUser.sub } });
        const userId = dbUser ? dbUser.id : (currentUser as any).id;

        whereClause = {
          OR: [
            { public: true },
            {
              projectRoles: {
                some: {
                  userId,
                  role: { in: [RoleEnum.manager, RoleEnum.editor, RoleEnum.viewer] },
                },
              },
            },
          ],
        };
      }
    } else {
      console.log('🌍 [getAllProjects] Unauthenticated user - showing only public projects');
      whereClause = { public: true };
    }

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
          where: { role: RoleEnum.manager },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                username: true,
                given_name: true,
                family_name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const projectsWithManagers = projects.map((project: any) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      public: project.public,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      manager: project.projectRoles.length > 0
        ? {
          id: project.projectRoles[0].user.id,
          name: project.projectRoles[0].user.name,
          email: project.projectRoles[0].user.email,
          username: project.projectRoles[0].user.username,
          displayName:
            project.projectRoles[0].user.name ||
            `${project.projectRoles[0].user.given_name || ''} ${project.projectRoles[0].user.family_name || ''}`.trim() ||
            project.projectRoles[0].user.username ||
            'Unknown User',
        }
        : null,
    }));

    res.json({ success: true, projects: projectsWithManagers });
  } catch (error) {
    console.error('❌ [getAllProjects] Error occurred:', error);
    res.status(500).json({
      error: 'Failed to fetch projects',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get a specific project by ID
 */
export async function getProjectById(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.params;

    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required' });
      return;
    }

    const db = getPrismaClient();
    const currentUser = await getCurrentUser(req);

    const whereClause = currentUser ? { id: projectId } : { id: projectId, public: true };

    const project = await db.project.findUnique({
      where: whereClause as any,
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true,
        projectRoles: {
          where: { role: RoleEnum.manager },
          select: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                username: true,
                given_name: true,
                family_name: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const projectWithManager = {
      ...project,
      manager: project.projectRoles.length > 0
        ? {
          id: project.projectRoles[0].user.id,
          email: project.projectRoles[0].user.email,
          name: project.projectRoles[0].user.name,
          username: project.projectRoles[0].user.username,
          displayName:
            project.projectRoles[0].user.name ||
            project.projectRoles[0].user.username ||
            project.projectRoles[0].user.email,
        }
        : null,
      projectRoles: undefined,
    };

    res.json({ success: true, project: projectWithManager });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      error: 'Failed to fetch project',
      message: error instanceof Error ? error.message : 'Unknown error',
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
      res.status(400).json({ error: 'Project name is required and must be a non-empty string' });
      return;
    }

    const db = getPrismaClient();

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!currentUser.sys_admin && !currentUser.sys_creator) {
      res.status(403).json({ error: 'Insufficient permissions to create projects' });
      return;
    }

    const trimmedName = name.trim();
    const existingProject = await db.project.findFirst({ where: { name: trimmedName } });
    if (existingProject) {
      res.status(409).json({ error: 'A project with this name already exists' });
      return;
    }

    // IMPORTANT: description must be a string if Prisma schema is String (non-nullable)
    const safeDescription = typeof description === 'string' ? description.trim() : '';

    const project = await db.project.create({
      data: {
        name: trimmedName,
        description: safeDescription,
        public: Boolean(isPublic) || false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Create unified project directory structure
    ensureProjectSkeleton(project.id);

    // Create empty scene.json under 3d-model/
    const emptyScene = {
      models: [],
      environment: { showGround: true, background: '#404040' },
      enableControls: true,
    };

    fs.writeFileSync(
      path.join(projectModel3dDir(project.id), 'scene.json'),
      JSON.stringify(emptyScene, null, 2),
      'utf-8'
    );

    // Assign manager role (best-effort)
    try {
      await db.projectRole.create({
        data: {
          userId: (currentUser as any).id,
          projectId: project.id,
          role: RoleEnum.manager,
        },
      });
    } catch (err) {
      console.warn('Failed to assign project manager role:', err instanceof Error ? err.message : err);
    }

    const projectWithManager = {
      ...project,
      manager: {
        id: (currentUser as any).id,
        name: currentUser.name,
        email: currentUser.email,
        username: currentUser.username,
        displayName:
          currentUser.name ||
          `${currentUser.given_name || ''} ${currentUser.family_name || ''}`.trim() ||
          currentUser.username ||
          'Unknown User',
      },
    };

    // Audit (best-effort)
    try {
      await logAuditEvent({
        userSub: currentUser.sub,
        eventType: 'project.create',
        success: true,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || (req.connection as any)?.remoteAddress || null,
        payload: {
          projectId: project.id,
          projectName: project.name,
          description: project.description,
          public: project.public,
        },
      });
    } catch (auditErr) {
      console.warn('Failed to log project creation audit event:', auditErr instanceof Error ? auditErr.message : auditErr);
    }

    res.status(201).json({ success: true, project: projectWithManager });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      error: 'Failed to create project',
      message: error instanceof Error ? error.message : 'Unknown error',
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

    if (!projectId) {
      res.status(400).json({ error: 'Project ID is required' });
      return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Project name is required and must be a non-empty string' });
      return;
    }

    const db = getPrismaClient();

    const existingProject = await db.project.findUnique({ where: { id: projectId } });
    if (!existingProject) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const nameConflict = await db.project.findFirst({
      where: { name: name.trim(), NOT: { id: projectId } },
    });
    if (nameConflict) {
      res.status(409).json({ error: 'A project with this name already exists' });
      return;
    }

    if (managerId) {
      const managerUser = await db.user.findUnique({ where: { id: managerId } });
      if (!managerUser) {
        res.status(400).json({ error: 'Selected manager user not found' });
        return;
      }
    }

    const safeDescription = typeof description === 'string' ? description.trim() : '';

    const updatedProject = await db.project.update({
      where: { id: projectId },
      data: {
        name: name.trim(),
        description: safeDescription,
        public: isPublic !== undefined ? Boolean(isPublic) : undefined,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (managerId !== undefined) {
      await db.projectRole.deleteMany({
        where: { projectId, role: RoleEnum.manager },
      });

      if (managerId) {
        await db.projectRole.create({
          data: { userId: managerId, projectId, role: RoleEnum.manager },
        });
      }
    }

    res.json({ success: true, project: updatedProject });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      error: 'Failed to update project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete a project (manager only)
 * DELETE /api/projects/:projectId
 *
 * Must delete filesystem: project_files/PROJECT_ID (entire project root)
 */
export async function deleteProject(req: Request, res: Response) {
  const { projectId } = req.params;

  if (!projectId) {
    return res.status(400).json({ error: 'Project ID is required' });
  }

  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const db = getPrismaClient();

    const isManager = await checkIsManagerOfProject(db, currentUser, projectId);
    if (!isManager) {
      return res.status(403).json({ error: 'Only project managers can delete the project' });
    }

    const project = await db.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Delete project files from filesystem (new unified root)
    const projectPath = projectRoot(projectId);
    if (fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    await db.project.delete({ where: { id: projectId } });

    console.log(`✅ Project deleted: ${projectId} by user: ${currentUser.email}`);

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      error: 'Failed to delete project',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
