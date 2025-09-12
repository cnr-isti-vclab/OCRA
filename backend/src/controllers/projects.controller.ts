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
    
    // Get all projects with basic information
    const projects = await db.project.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      projects
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
    const { name, description } = req.body;
    
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
      },
      select: {
        id: true,
        name: true,
        description: true,
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