## Introduction

OCRA is a collaborative, web-based tool to support conservation-restoration workflows by enabling annotation of high-resolution 3D models of cultural heritage objects. Designed with iPad support for field use by conservators

### User Workflows
The OCRA App manage the user and project workflow with a role-based access control (RBAC) system. User authentication is delegated via the OAuth protocol. Email returned by the authenticatin provider is used as the unique user identifier on the ocra system, and authenticated users are created on first login if not already present in the system with basic previleges (Viewer). 
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
In the following we describe a typical lifecycle of a Conservation-restoration Project on the OCRA system:
- An user (a) with creator previleges log in the system and create a project (P), (a) by default is the manager of the project (P)
- A user (b) with admin previleges log in the system and create a vocabulary (V) for the project (P)
- The project manager (a) assign users (c) and (d) to the project (P) with editor and viewer roles respectively
- The project manager (a) upload a 3d Models and prepare its reference space 
- The editor (c) create annotations on the 3d model using the vocabulary (V)
- The viewer (d) can view the annotations and export them for reporting or further analysis
- The project manager (a) can publish a project that will exported in a readonly version with more permissive access rules (e.g. visibile also to unauthenticated users)

users recap

- a alice, has creator previleges and is  manager of project p
- b bob admin previleges 
- c carol editor of project p
- d david viewer




Detailed Workflows steps are described in the following sections.

### Annotation workflow
Annotations are created by users with editor or manager roles. 
Once in a project creating an annotation requires the following steps:
1. Select the 3D model/layer/entity to be annotated
2. Define the georeference (point, line, area) in the 3D model space
3. Choose the annotation type from the controlled vocabulary
4. Fill in the annotation fields that are not automatically generated (date, author, type, etc.)
5. Save the annotation

Defining georeferences

georefs are in theory spatial definitions that are independent wrt the model apart the fact that they are defined in the same space. in practice you use the 3d model to define them interactively

