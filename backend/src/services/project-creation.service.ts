import fs from 'fs';
import path from 'path';
import { RoleEnum } from '@prisma/client';
import { getPrismaClient } from '../../db.js';
import type { User } from '../types/index.js';
import {
  ensureProjectSkeleton,
  projectModel3dDir,
} from '../utils/project-static-paths.js';

export interface CreateManagedProjectInput {
  name: string;
  description: string;
  isPublic: boolean;
  owner: User;
}

export interface CreatedManagedProject {
  id: string;
  name: string;
  description: string;
  public: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Creates a project with the standard filesystem scaffold and assigns the owner
 * as project manager.
 */
export async function createManagedProject(
  input: CreateManagedProjectInput
): Promise<CreatedManagedProject> {
  const db = getPrismaClient();

  const project = await db.project.create({
    data: {
      name: input.name,
      description: input.description,
      public: input.isPublic,
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

  ensureProjectSkeleton(project.id);

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

  await db.projectRole.create({
    data: {
      userId: input.owner.id,
      projectId: project.id,
      role: RoleEnum.manager,
    },
  });

  return project;
}
