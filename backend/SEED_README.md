# Database Seeding

This document explains how the database seeding works in OCRA.

## Overview

The `seed.ts` script is automatically run when the backend container starts (via `start.sh`). It populates the database with:

1. **Demo Projects** - 4 example projects including two with pre-populated 3D models
2. **Demo Users** - 3 test users from the Keycloak demo realm
3. **Project Roles** - Role assignments for demo users
4. **Project Files** - Scene JSON files and 3D model files copied to project folders

## Project Folder Population

The seed script automatically copies files from the `/media` folder to individual project folders:

### Lion Crushing a Serpent
- **Scene JSON**: Includes model definition with title and rotation
- **Model File**: `lion_crushing_a_serpent_t1k.glb`
- **Manager**: lab-head@example.com

### louis_xiv_de_france
- **Scene JSON**: Includes model definition with title and rotation  
- **Model File**: `louis_xiv_de_france_louvre_paris_t1k.glb`
- **Manager**: director@example.com

## Adding New Sample Projects

To add a new project with pre-populated files:

1. **Add the scene data** to the `sampleProjectData` array:
   ```typescript
   {
     "models": [
       {
         "id": "model_id",
         "title": "Model Title",
         "file": "model_file.glb",
         "visible": true,
         "rotation": [180, 0, 0]
       }
     ],
     "environment": {
       "showGround": true,
       "background": "#404040"
     },
     "enableControls": true
   }
   ```

2. **Add the project** to the `projects` array in `seedDemoProjects()`

3. **Add the mapping** in `populateProjectFolders()`:
   ```typescript
   {
     projectName: 'Your Project Name',
     sceneDataIndex: 2, // index in sampleProjectData array
     modelFiles: ['your_model_file.glb']
   }
   ```

4. **Place the model file** in the `/media` folder at the repository root

5. **Rebuild** the Docker containers to pick up the changes

## File Locations

- **Source media files**: `/media` (repository root)
- **Destination project files**: `/app/project_files/{projectId}/` (in container)
  - Configured via `PROJECT_FILES_PATH` environment variable
- **Scene files**: `/app/project_files/{projectId}/scene.json`

## Running Manually

The seed script runs automatically on container startup. To run it manually:

```bash
# Inside the backend container
npm run seed

# Or using docker-compose
docker-compose exec backend npm run seed
```

Note: Running the seed script multiple times is safe - it uses `upsert` operations that won't create duplicates.
