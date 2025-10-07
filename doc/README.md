# OCRA Documentation

**OCRA** - **O**nline **C**onservation-**R**estoration **A**nnotator

Documentation for developers, users, and maintainers.

---

## 📚 Documentation Index

### For Developers

#### Architecture & Design
- **[Use Case & Requirements](./OCRA_UseCase.md)** - Original use case description and platform objectives
- **[Workflow Documentation](./workflow.md)** - User workflows and system interactions

#### API Documentation
- **[API Quick Reference](./API_QUICK_REFERENCE.md)** - Quick reference for all API endpoints
- **[Swagger API Documentation](./API_SWAGGER_DOCUMENTATION.md)** - Complete OpenAPI/Swagger implementation guide

#### Technical Specifications
- **[Scene JSON Format](./SCENE_JSON_FORMAT.md)** ⭐ **NEW** - Complete specification for scene.json file format
  - Model definitions and transformations
  - Environment settings
  - Examples and validation rules
  - Supported 3D file formats

### For Users
- **[User Guide](./OCRA_UseCase.md)** - Platform features and usage (see sections on collaborative annotation)

### For Maintainers
- **[API Swagger Documentation](./API_SWAGGER_DOCUMENTATION.md)** - Maintaining API documentation
- **[Refactoring Summary](../REFACTORING_SUMMARY.md)** - History of code refactoring
- **[Restructuring Summary](../RESTRUCTURING_SUMMARY.md)** - Project structure changes

---

## 🏗️ Technical Architecture

### Frontend
- **Framework**: React 19 + TypeScript + Vite
- **3D Engine**: Three.js with custom ThreePresenter component
- **UI**: Bootstrap 5
- **Authentication**: OAuth2 PKCE with Keycloak

### Backend
- **Runtime**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (user data, projects) + MongoDB (audit logs)
- **ORM**: Prisma
- **File Storage**: Local filesystem in Docker volumes

### 3D Rendering Stack
- **Scene Format**: Custom JSON format (see [Scene JSON Format](./SCENE_JSON_FORMAT.md))
- **Presenter**: ThreePresenter class (`/frontend/src/components/ThreePresenter.ts`)
- **Supported Formats**: GLB, GLTF, PLY, OBJ, STL, FBX, DAE, 3DS, X3D, NXS
- **Features**:
  - Auto-centering and normalization
  - Multiple models per scene
  - Transform controls (position, rotation, scale)
  - PBR materials and HDR environment maps
  - Orbit controls and viewport gizmo
  - Screenshot capture

---

## 🚀 Quick Start

### Development Setup

```bash
# Clone the repository
git clone https://github.com/cnr-isti-vclab/OCRA.git
cd OCRA

# Start all services with Docker Compose
docker-compose up -d

# Access the application
# Frontend: http://localhost:3001
# Backend API: http://localhost:3002
# API Documentation: http://localhost:3002/api-docs
# Keycloak Admin: http://localhost:8081
```

### Demo Users
- **Lab Head**: `labhead@example.com` / password from Keycloak
- **Museum Director**: `director@example.com` (has sys_creator privilege)
- **Conservator**: `conservator@example.com`

---

## 📖 Key Documentation Files

### Scene JSON Format (`SCENE_JSON_FORMAT.md`)
The most comprehensive documentation for the 3D scene configuration system:

**What it covers:**
- Complete schema and property reference
- Model transformations (position, rotation, scale)
- Environment settings (ground, background)
- Material overrides
- Rotation units (degrees vs radians)
- Multiple complete examples
- Validation rules and common errors
- Performance considerations

**When to use:**
- Creating or editing scene.json files
- Understanding model loading behavior
- Debugging transformation issues
- Adding new 3D assets to projects

### API Quick Reference (`API_QUICK_REFERENCE.md`)
Fast lookup for API endpoints:
- Authentication & session management
- Project CRUD operations
- File upload and management
- User administration
- Example curl commands

### Swagger Documentation (`API_SWAGGER_DOCUMENTATION.md`)
Interactive API documentation at `/api-docs`:
- Try endpoints directly in browser
- See request/response schemas
- Authentication requirements
- Error responses

---

## 🔧 Development Workflow

### Working with 3D Models

1. **Upload Model**: Use the "Add Model" button in project view (manager only)
2. **Configure Scene**: Edit `scene.json` in project folder:
   ```json
   {
     "models": [
       {
         "id": "model_id",
         "file": "model.glb",
         "rotation": [180, 0, 0],
         "rotationUnits": "deg"
       }
     ]
   }
   ```
3. **Reload**: Refresh the page to see changes

### Updating API Documentation

1. Add `@openapi` JSDoc comments to route handlers
2. Restart backend: `docker-compose restart backend`
3. Visit http://localhost:3002/api-docs to see changes

### Testing

```bash
# Backend tests (if available)
cd backend && npm test

# Frontend tests (if available)
cd frontend && npm test
```

---

## 📝 Type Definitions

### Shared Types (`/shared/scene-types.ts`)
TypeScript interfaces shared between frontend and backend:
- `SceneDescription` - Complete scene configuration
- `ModelDefinition` - Individual model properties
- `EnvironmentSettings` - Scene environment
- `PresenterState` - Camera and rendering state
- `CameraState` - Camera position and orientation

These types provide compile-time validation and IDE autocomplete.

---

## 🐛 Common Issues

### Models Not Loading
1. Check file exists in `/project_files/{projectId}/`
2. Verify `scene.json` syntax is valid JSON
3. Check browser console for loader errors
4. Ensure file format is supported

### Transformations Not Working
1. Check rotation units (`"deg"` vs `"rad"`)
2. Verify transformation order: Scale → Rotation → Position
3. See [Scene JSON Format](./SCENE_JSON_FORMAT.md) for examples

### API Authentication
1. Ensure session cookie is set
2. Check Keycloak is running: http://localhost:8081
3. Verify user has correct role for endpoint

---

## 🤝 Contributing

### Documentation
- Keep `SCENE_JSON_FORMAT.md` updated when changing scene schema
- Update API documentation when adding/modifying endpoints
- Add examples for new features

### Code
- Follow TypeScript best practices
- Add JSDoc comments for public APIs
- Update type definitions in `/shared/scene-types.ts`
- Test with multiple 3D file formats

---

## 📞 Support

For questions or issues:
1. Check this documentation index
2. Review relevant technical docs
3. Check the API documentation at `/api-docs`
4. Consult the source code (well-commented)

---

## 🗺️ Roadmap

### Completed
- ✅ Multi-model scene support
- ✅ Transform controls
- ✅ Material overrides
- ✅ Environment settings
- ✅ Swagger API documentation
- ✅ File upload and management
- ✅ User roles and permissions
- ✅ Screenshot capture

### In Progress
- 🔄 Annotation system (see tabs in project view)

### Planned
- 📋 Camera presets and animations
- 📋 Advanced lighting controls
- 📋 Model groups and hierarchies
- 📋 Annotation markers on 3D models
- 📋 Collaborative editing
- 📋 Export to structured documentation

---

*Last Updated: October 7, 2025*
