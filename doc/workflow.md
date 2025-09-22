## Introduction

OCRA is a collaborative, web-based tool to support conservation-restoration workflows by enabling annotation of high-resolution 3D models of cultural heritage objects. Designed with iPad support for field use by conservators

### User Workflows
The OCRA App manage the user and project workflow with a role-based access control (RBAC) system. User authentication is delegated via the OAuth protocol. Email returned by the authenticatin provider is used as the unique user identifier on the ocra system, and users are created on first login if not already present in the system. 
Once a user is authenticated, they can access the system and see the public projects and the private project they are assigned to.

System level properties/previleges of users: (not per project)
- Admin User: Full system access, Create Project, user management, vocabulary control 
- Creator: can create new projects

Per Project User Roles 
- Project Manager: Edit projects properties, manage roles for users, can access and edit all project data
- Editor: Create and edit annotations
- Viewer: Read-only access, export capabilities

Unauthenticated users cannot log on the system and can access only the landing page and the 'published' projects.

### Project workflow
The typical lifecylce of a Conservation-restoration Project is the following one
- A user (a) with creator previleges log in the system and create a project (P), (a) by default is the manager of the project (P)
- A user (b) with admin previleges log in the system and create a vocabulary (V) for the project (P)
- The project manager (a) assign users (c) and (d) to the project (P) with editor and viewer roles respectively
- The project manager (a) upload a 3d Models and prepare its reference space 
- The editor (c) create annotations on the 3d model using the vocabulary (V)
- The viewer (d) can view the annotations and export them for reporting or further analysis

## Annotation Semantics
Two main concepts: Annotations and Georeferences
- Georeferences: 3D points, lines, or areas on the model
- Annotations: A set of Vocabulary controlled information associated with a set of Georeferences

So in practice, an annotation is a semantic description of a set of georeferences on the 3D model 

## OCRA App Architecture

The OCRA App is built as a Single Page Application (SPA) using React. The main entry point is `App.tsx`, which handles routing and authentication.

