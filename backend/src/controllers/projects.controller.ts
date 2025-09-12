import { Request, Response } from 'express';
import { getPrismaClient } from '../../db.js';

/**
 * PROJECTS CONTROLLER (TypeScript)
 * 
 * Handles project-related API endpoints including listing projects,
 * creating new projects, and managing project data.
 */

/**
 * Get all projects in the system
 */
export async function getAllProjects(req: Request, res: Response): Promise<void> {
  try {
    const db = getPrismaClient();
    
    // Get all projects with manager information
    const projects = await db.project.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true,
        projectRoles: {
          where: {
            roleId: 'manager'
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

    // Transform the data to include manager information more clearly
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

    res.json({
      success: true,
      projects: projectsWithManagers
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ 
      error: 'Failed to fetch projects',
      message: error instanceof Error ? error.message : 'Unknown error'
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
      res.status(400).json({
        error: 'Project ID is required'
      });
      return;
    }
    
    const db = getPrismaClient();
    
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true,
        public: true,
        createdAt: true,
        updatedAt: true,
      }
    });
    
    if (!project) {
      res.status(404).json({
        error: 'Project not found'
      });
      return;
    }
    
    res.json({
      success: true,
      project
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
    const { name, description, public: isPublic } = req.body;
    
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