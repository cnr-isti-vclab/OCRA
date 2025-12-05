# Local Development Setup (without Docker Compose)

Guide to run **Keycloak**, **PostgreSQL**, **MongoDB**, backend and frontend locally for development, without rebuilding Docker Compose on every change.

## 1. Prerequisites

- Docker and Docker CLI installed.[3]
- Node.js and npm installed.  
- Free ports:
  - Keycloak: `8081` (mapped to container `8080`)
  - PostgreSQL: `5432`
  - MongoDB: `27017`
  - Backend: `3002`
  - Frontend: `5173` (Vite)

Repository cloned to:

```bash
/home/<user>/git/OCRA
```

(adapt if your path is different).[1]

***

## 2. Environment configuration

### 2.1 Root `.env` (Prisma / Postgres)

At `OCRA/.env`:

```env
DATABASE_URL="postgresql://ocra_user:ocra_pass@localhost:5432/ocra?schema=public"
```

This file is used by Prisma CLI commands (`npx prisma ...`).

### 2.2 Backend `.env`

At `OCRA/backend/.env`:

```env
# Keycloak
ISSUER=http://localhost:8081/realms/demo
CLIENT_ID=react-oauth
CLIENT_SECRET=

# Backend
PORT=3002
CORS_ORIGINS=http://localhost:5173,http://localhost:3001,http://localhost:5174

# PostgreSQL (Prisma in backend)
DATABASE_URL=postgresql://ocra_user:ocra_pass@localhost:5432/ocra?schema=public
DIRECT_URL=postgresql://ocra_user:ocra_pass@localhost:5432/ocra?schema=public

# Optional admin
SYS_ADMIN_EMAIL=admin@ocra.it

# MongoDB for audit logs
MONGO_URL=mongodb://localhost:27017
MONGO_DB=ocra_audit
MONGO_COLLECTION=audit

# Local directory for project files
PROJECT_FILES_PATH=/home/lfabio/git/OCRA/project_files
```

Ensure `server.ts` imports `dotenv/config`:

```ts
import 'dotenv/config';
```

So that the backend reads `backend/.env`.

***

## 3. Start DB services and Keycloak

### 3.1 PostgreSQL container

```bash
docker run -d \
  --name ocra-postgres \
  -e POSTGRES_USER=ocra_user \
  -e POSTGRES_PASSWORD=ocra_pass \
  -e POSTGRES_DB=ocra \
  -p 5432:5432 \
  postgres:16
```

Check:

```bash
docker ps        # should list ocra-postgres
psql "postgresql://ocra_user:ocra_pass@localhost:5432/ocra" -c "\dt"
```

After migrations (see §4) you should see tables `users`, `sessions`, `projects`, `project_roles`, `vocabularies`.

### 3.2 MongoDB container

```bash
docker run -d \
  --name ocra-mongo \
  -p 27017:27017 \
  mongo:7
```

Check:

```bash
docker ps        # should list ocra-mongo
```

### 3.3 Keycloak container

```bash
docker run -d \
  --name keycloak \
  -p 8081:8080 \
  -e KEYCLOAK_ADMIN=Administrator \
  -e KEYCLOAK_ADMIN_PASSWORD=admin@ocra.it \
  quay.io/keycloak/keycloak:latest \
  start-dev
```

Check:

```bash
docker ps                   # should list keycloak
curl http://localhost:8081/ # should return Keycloak HTML
```


***

## 4. Initialize Prisma database

From the project root:

```bash
cd /home/lfabio/git/OCRA
npx prisma migrate dev --name init
```

This creates and applies the initial migration, generating all Prisma tables.

Quick check:

```bash
psql "postgresql://ocra_user:ocra_pass@localhost:5432/ocra" -c "\dt"
```

***

## 5. Directory for project files

Create a local writable directory for project-related files:

```bash
mkdir -p /home/lfabio/git/OCRA/project_files
chmod 777 /home/lfabio/git/OCRA/project_files   # fine for local development
```

The backend uses this path via `PROJECT_FILES_PATH` in `backend/.env`.

***

## 6. Keycloak configuration (demo realm)

1. Open `http://localhost:8081/` in the browser.  
2. Log in as temporary admin:
   - Username: `Administrator`
   - Password: `admin@ocra.it`
3. Create realm `demo`:
   - Left menu → **Manage realms** → **Add realm**
   - Name: `demo` → **Create**
4. Import demo configuration:
   - Select realm `demo` (top-left)
   - **Realm settings → Action → Partial import**
   - Upload `keycloak/realm-export/demo-realm.json`
   - Confirm import (users + `react-oauth` client).
5. Verify the client:
   - **Clients → react-oauth**
   - `Redirect URIs` includes `http://localhost:5173/*`
   - `Web origins` includes `http://localhost:5173`

Reference OIDC endpoints:

```text
Issuer: http://localhost:8081/realms/demo
Authorization endpoint: /protocol/openid-connect/auth
Token endpoint:        /protocol/openid-connect/token
```

***

## 7. Start backend and frontend

### 7.1 Install dependencies (once)
From the repo root:
```bash
cd /home/lfabio/git/OCRA
npm install
```
This uses the workspaces configuration to install dependencies for both `frontend` and `backend`.

### 7.2 Backend

From the repo root:
```bash
npm run dev:backend
```
Checks:

- Logs should show:
  - `OAuth Backend running on http://localhost:3002`
  - No errors about `DATABASE_URL` or `MONGO_URL`
  - No `EACCES` errors for the project files path.

Health check:

```bash
curl http://localhost:3002/health
```

### 7.3 Frontend

From the repo root:

```bash
npm run dev:frontend # typically Vite on http://localhost:5173
```

Then open `http://localhost:5173/` in the browser.

***

## 8. First login and user permissions

1. From the frontend, click **Login**.  
2. Keycloak login page opens for realm `demo`.  
3. For example:

   ```text
   username: museum-director
   password: museum-director
   ```

4. After the first login, the user is created in the `users` table.  
   If needed, promote them to creator/sysadmin via `psql`:

   ```sql
   UPDATE users
   SET sys_admin = true,
       sys_creator = true
   WHERE username = 'museum-director';
   ```

When logged in as `museum-director` you should see the button to create a new project and be able to create it without errors.

***

## 9. Quick verification commands

- **Prisma / DB:**

  ```bash
  cd /home/lfabio/git/OCRA
  npx prisma migrate status
  npx prisma studio      # opens web UI to inspect data
  ```

- **Postgres tables:**

  ```bash
  psql "postgresql://ocra_user:ocra_pass@localhost:5432/ocra" -c "\dt"
  ```

- **Current user sessions:**

  ```bash
  psql "postgresql://ocra_user:ocra_pass@localhost:5432/ocra" -c "SELECT * FROM sessions;"
  ```

- **Docker services:**

  ```bash
  docker ps   # keycloak, ocra-postgres, ocra-mongo should all be 'Up'
  ```

With this procedure you can work locally with **hot-reload** (backend via `tsx watch`, frontend via Vite) without rebuilding Docker images, using containers only for external services (Keycloak, Postgres, MongoDB).
