# Local Development Setup (without Docker Compose)

Guide to run **Keycloak**, **PostgreSQL**, **MongoDB**, backend and frontend locally for development, without rebuilding Docker Compose on every change.

## 1. Prerequisites

- Docker and Docker CLI installed
- Node.js and npm installed  
- Free ports:
  - Keycloak: `8081` (mapped to container `8080`)
  - PostgreSQL: `5432`
  - MongoDB: `27017`
  - Backend: `3002`
   - Frontend: `3001`

Repository cloned to:

```bash
/home/<user>/git/OCRA
```

(adapt if your path is different)

***

## 2. Environment configuration

### 2.1 Root `.env` (Optional)

At `OCRA/.env`:

```env
NODE_ENV=production
```

This file is minimal and mainly used for deployment configuration.

### 2.2 Backend `.env`

At `OCRA/backend/.env`:

```env
# Keycloak
ISSUER=http://localhost:8081/realms/demo
CLIENT_ID=react-oauth
CLIENT_SECRET=

# Backend
PORT=3002
CORS_ORIGINS=http://localhost:3001,http://localhost:5173

# PostgreSQL (REQUIRED for Prisma)
DATABASE_URL=postgresql://ocra_user:ocra_pass@localhost:5432/ocra?schema=public
DIRECT_URL=postgresql://ocra_user:ocra_pass@localhost:5432/ocra?schema=public

# Optional admin
SYS_ADMIN_EMAIL=admin@ocra.it

# MongoDB
MONGO_URL=mongodb://127.0.0.1:27017/?replicaSet=rs0
MONGO_AUDIT_DB=ocra_audit
MONGO_AUDIT_COLLECTION=audit
MONGO_CONTENT_DB=ocra_content

# Local directory for project files (relative to backend/)
PROJECT_FILES_PATH=../project_files
```

Ensure `server.ts` imports `dotenv/config`:

```ts
import 'dotenv/config';
```

So that the backend reads `backend/.env`.

***

## 3. Start DB services and Keycloak

### 3.1 Clean up old PostgreSQL containers (if needed)

If you have an old `bare-ocra-postgres` container with wrong credentials:

```bash
# Check existing containers
docker ps -a | grep postgres

# If you find old containers with wrong credentials:
docker stop bare-ocra-postgres
docker rm bare-ocra-postgres

# Optional: backup data before removing (if you need it)
# docker exec bare-ocra-postgres pg_dump -U <old_user> <old_db> > backup.sql
```

### 3.2 Use the automated script (RECOMMENDED)

The project includes scripts to start/stop all services with correct credentials:

```bash
cd /home/<user>/git/OCRA

# Start all services
npm run services:start

# Stop all services (when done)
npm run services:stop
```

This will create or start:
- `bare-ocra-postgres` with `ocra_user:ocra_pass@localhost:5432/ocra`
- PostgreSQL test database `ocra_test` owned by `ocra_user`
- `bare-ocra-mongo` at `localhost:27017` with single-node replica set `rs0`
- `bare-keycloak` at `localhost:8081`

### 3.3 Manual PostgreSQL setup (alternative)

If you prefer manual setup:

```bash
docker run -d \
  --name bare-ocra-postgres \
  -e POSTGRES_USER=ocra_user \
  -e POSTGRES_PASSWORD=ocra_pass \
  -e POSTGRES_DB=ocra \
  -v ocra-postgres-data:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16
```

Check connection:

```bash
psql postgresql://ocra_user:ocra_pass@localhost:5432/ocra -c "\l"
```

### 3.4 Manual MongoDB setup (alternative)

```bash
docker run -d \
  --name bare-ocra-mongo \
  -p 27017:27017 \
  -v ocra-mongo-data:/data/db \
   mongo:7 \
   --replSet rs0 --bind_ip_all

npm run mongo:init
```

The `mongo:init` step is idempotent. It also initializes the single-node replica set `rs0`, so run it again if the container already existed before replica set support was introduced.

### 3.5 Manual Keycloak setup (alternative)

```bash
docker run -d \
  --name bare-keycloak \
  -p 8081:8080 \
  -e KEYCLOAK_ADMIN=Administrator \
  -e KEYCLOAK_ADMIN_PASSWORD=admin@ocra.it \
  -v keycloak-data:/opt/keycloak/data \
  quay.io/keycloak/keycloak:latest \
  start-dev
```

Verify all services:

```bash
docker ps                   # should list all three containers
curl http://localhost:8081/ # should return Keycloak HTML
```

***

## 4. Understanding PostgreSQL Setup: Volumes and Credentials

This section explains how OCRA manages PostgreSQL data persistence and credential creation.

### 4.1 Docker Volume Creation

When you run `npm run services:start` for the first time, Docker automatically creates a **named volume** called `ocra-postgres-data`:

```bash
# The start script includes this volume mount:
-v ocra-postgres-data:/var/lib/postgresql/data
```

**What happens:**
1. **First run**: Docker creates the volume `ocra-postgres-data` and mounts it to `/var/lib/postgresql/data` inside the container
2. **Subsequent runs**: Docker reuses the existing volume, preserving all data

You can inspect the volume:
```bash
# List Docker volumes
docker volume ls | grep ocra

# Inspect volume details
docker volume inspect ocra-postgres-data
```

### 4.2 PostgreSQL Credential Generation

The PostgreSQL container uses these environment variables to automatically configure the database:

```bash
-e POSTGRES_USER=ocra_user       # Creates this user as database owner
-e POSTGRES_PASSWORD=ocra_pass   # Sets password for ocra_user  
-e POSTGRES_DB=ocra              # Creates database named "ocra"
```

**First-time initialization process:**
1. Container starts and detects empty data volume
2. PostgreSQL runs initialization scripts that:
   - Create the `ocra_user` with password `ocra_pass`
   - Create the `ocra` database owned by `ocra_user`
   - Grant all privileges on `ocra` database to `ocra_user`
3. All this configuration is saved in the volume

**Important:** This initialization only happens when the data volume is empty. If the volume already contains data, PostgreSQL skips initialization and uses existing users/databases.

### 4.3 Data Persistence Behavior

Understanding what persists and what doesn't:

**Container Level (Ephemeral):**
- Container process and configuration
- Environment variables
- Network settings
- **Removed with**: `docker rm bare-ocra-postgres`

**Volume Level (Persistent):**
- Database files and data
- User accounts and permissions
- All your Prisma tables and data
- **Removed only with**: `docker volume rm ocra-postgres-data`

### 4.4 Common Scenarios

**Scenario A: Container recreation (normal troubleshooting)**
```bash
docker stop bare-ocra-postgres
docker rm bare-ocra-postgres        # Container deleted
npm run services:start              # New container, same volume
# Result: All data preserved, same credentials work
```

**Scenario B: Complete reset**
```bash
docker stop bare-ocra-postgres
docker rm bare-ocra-postgres
docker volume rm ocra-postgres-data  # Volume deleted
npm run services:start               # Everything recreated
# Result: Fresh database, need to run migrations again
```

**Scenario C: Credential mismatch (what happened in your case)**
```bash
# Old container had different credentials (maybe postgres:postgres)
# Volume has data from old setup
# New container tries ocra_user:ocra_pass but volume expects old credentials
# Solution: Remove container, let script recreate with correct credentials
```

### 4.5 Verification Commands

Check your setup at any time:

```bash
# Check if volume exists
docker volume ls | grep ocra-postgres-data

# Check container status
docker ps | grep bare-ocra-postgres

# Test database connection
psql postgresql://ocra_user:ocra_pass@localhost:5432/ocra -c "SELECT version();"

# Check if Prisma tables exist
psql postgresql://ocra_user:ocra_pass@localhost:5432/ocra -c "\dt"
```

***

## 5. Initialize Prisma database

### 5.1 Install dependencies

From the repo root:
```bash
cd /home/<user>/git/OCRA
npm install
```

This uses workspaces configuration to install dependencies for both `frontend` and `backend`.

### 5.2 Generate Prisma Client and run migrations

**Important:** The PostgreSQL container automatically creates the `ocra` database when first started (via `POSTGRES_DB=ocra` environment variable). Prisma then creates the tables inside this existing database.

When you pull a branch that contains committed Prisma migrations, use this team command from the repository backend folder:

```bash
cd /home/<user>/git/OCRA/backend && npx prisma migrate deploy && npx prisma generate
```

Use `migrate deploy` for shared committed migrations. Do not replace this with `db push` when the schema change is meant to be tracked and shared with the rest of the team.

From the repo root (using npm workspace scripts):

```bash
cd /home/<user>/git/OCRA

# Generate Prisma Client
npm run db:generate

# Apply database migrations (creates tables in existing "ocra" database)
npm run db:migrate

# OR if you prefer to push schema without migrations:
cd backend && npx prisma db push
```

Verification steps:

```bash
# 1. Check database exists (created by PostgreSQL container)
psql postgresql://ocra_user:ocra_pass@localhost:5432/ocra -c "\l"

# 2. Check tables exist (created by Prisma migration)
psql postgresql://ocra_user:ocra_pass@localhost:5432/ocra -c "\dt"
```

You should see tables: `users`, `sessions`, `projects`, `project_roles`, `vocabularies`, etc.

**Note:** This project uses Prisma 5.18.0 (specified in package.json overrides)

***

## 6. Directory for project files

Create a local writable directory for project-related files:

```bash
mkdir -p /home/<user>/git/OCRA/project_files
chmod 755 /home/<user>/git/OCRA/project_files
```

The backend uses this path via `PROJECT_FILES_PATH` in `backend/.env`.

***

## 7. Keycloak configuration (demo realm)

### 7.1 Access Keycloak Admin Console

1. Open `http://localhost:8081/` in the browser
2. Log in as admin:
   - Username: `Administrator`
   - Password: `admin@ocra.it`

### 7.2 Import demo realm

1. Create realm `demo`:
   - Left menu → **Create Realm**
   - Name: `demo` → **Create**
2. Import demo configuration:
   - Select realm `demo` (top-left dropdown)
   - **Realm settings → Action → Partial import**
   - Upload `keycloak/realm-export/demo-realm.json`
   - Check **Users** and **Clients** → **Import**
3. Verify the client:
   - **Clients → react-oauth**
   - Check that **Valid redirect URIs** includes `http://localhost:3001/*`
   - Check that **Web origins** includes `http://localhost:3001`

Reference OIDC endpoints:

```text
Issuer: http://localhost:8081/realms/demo
Authorization: /protocol/openid-connect/auth
Token: /protocol/openid-connect/token
```

***

## 8. Start backend and frontend

**RECOMMENDED:** Use two separate terminal windows/tabs for better log visibility and control.

### 8.1 Backend (Terminal 1)

From the repo root:
```bash
npm run dev:backend
```

Expected logs:
- `OAuth Backend running on http://localhost:3002`
- `Database schema synchronized`
- `Database seeding completed`
- No errors about `DATABASE_URL` or `MONGO_URL`
- No `EACCES` errors for project files path

Health check:

```bash
curl http://localhost:3002/health
```

### 8.2 Frontend (Terminal 2)

From the repo root in a **separate terminal window**:

```bash
npm run dev:frontend
```

The expected dev URL is `http://localhost:3001` — bare and non-bare environments use the same frontend port.

Expected logs:
- `Local: http://localhost:3001/`
- `Network: http://192.168.x.x:3001/`
- Hot reload ready

Open `http://localhost:3001/` in the browser.

### 8.3 Why separate terminals?

Using separate terminals allows you to:
- Monitor backend and frontend logs independently
- Stop/restart services individually during development
- Easily identify which component is generating specific log messages
- Better debugging experience with clear log separation

***

## 9. First login and user permissions

### 9.1 Login process

1. From the frontend, click **Login**
2. Keycloak login page opens for realm `demo`
3. Use demo credentials, for example:
   ```text
   username: museum-director
   password: museum-director
   ```

### 9.2 Grant creator permissions (if needed)

After first login, the user is created in the `users` table. If you need creator/admin permissions:

```sql
psql postgresql://ocra_user:ocra_pass@localhost:5432/ocra -c "
UPDATE users 
SET sys_admin = true, sys_creator = true 
WHERE username = 'museum-director';
"
```

When logged in as `museum-director` you should see the button to create new projects.

***

## 10. Testing (Optional)

The project includes comprehensive testing capabilities:

### 10.1 Run tests

```bash
cd /home/<user>/git/OCRA

# Run comprehensive workflow tests
npm test

# Run tests with watch mode (auto-restart on changes)
npm run test:watch

# Open test UI interface
npm run test:ui

# Generate test coverage report
npm run test:coverage
```

### 10.2 Database utilities

```bash
# Open Prisma Studio (web UI for database inspection)
npm run db:studio

# Reset database (WARNING: deletes all data)
npm run db:reset
```

***

## 11. Troubleshooting

### 11.1 PostgreSQL connection issues

If you get `password authentication failed for user "ocra_user"`:

```bash
# Check which PostgreSQL containers exist
docker ps -a | grep postgres

# If you have old containers with different credentials:
docker stop bare-ocra-postgres
docker rm bare-ocra-postgres  # This removes ONLY the container, not the data

# Recreate with correct credentials using npm script
npm run services:stop
npm run services:start

# Check if your tables still exist (data is preserved in volume)
psql postgresql://ocra_user:ocra_pass@localhost:5432/ocra -c "\dt"
```

**Important:** Removing the container (`docker rm`) preserves data in the volume `ocra-postgres-data`. Your Prisma tables should still exist after recreating the container.

**Only if you see "No relations found"**, you need to run migrations again:
```bash
npm run db:migrate
```

### 11.2 Complete PostgreSQL reset (nuclear option)

If you want to start completely fresh (WARNING: deletes all data):

```bash
# Stop and remove container
docker stop bare-ocra-postgres
docker rm bare-ocra-postgres

# Remove data volume (THIS DELETES ALL DATA)
docker volume rm ocra-postgres-data

# Recreate everything
npm run services:start
npm run db:migrate  # Now required since database is empty
```

### 11.3 Complete service restart

If you need to restart all services:

```bash
# Stop all services
npm run services:stop

# Start all services again
npm run services:start
```

### 11.4 Database schema issues

If you get Prisma errors about missing tables:

```bash
# Reset and recreate database (WARNING: deletes all data)
npm run db:reset

# OR apply migrations
npm run db:migrate

# Regenerate Prisma client
npm run db:generate
```

### 11.5 Port conflicts

Check if ports are already in use:

```bash
lsof -i :5432  # PostgreSQL
lsof -i :27017 # MongoDB
lsof -i :8081  # Keycloak
lsof -i :3002  # Backend
lsof -i :3001  # Frontend
```

### 11.6 Project files permissions

If you get `EACCES` errors:

```bash
chmod 755 /home/<user>/git/OCRA/project_files
# OR for development (less secure):
chmod 777 /home/<user>/git/OCRA/project_files
```

***

## 12. Verification commands

**Database status:**
```bash
npm run db:studio  # opens web UI at http://localhost:5555
```

**Check migration status:**
```bash
cd backend
npx prisma migrate status
```

**Check database tables:**
```bash
psql postgresql://ocra_user:ocra_pass@localhost:5432/ocra -c "\dt"
```

**Check active sessions:**
```bash
psql postgresql://ocra_user:ocra_pass@localhost:5432/ocra -c "SELECT * FROM sessions LIMIT 5;"
```

**Verify Docker services:**
```bash
docker ps  # bare-ocra-postgres, bare-ocra-mongo, bare-keycloak should be 'Up'
```

**Backend health:**
```bash
curl http://localhost:3002/health
curl http://localhost:3002/oauth/status
```

With this setup you can develop locally with hot-reload (backend via `tsx watch`, frontend via Vite) using containers only for external services (Keycloak, PostgreSQL, MongoDB).

***

## 13. Production Build (Optional)

For production builds:

```bash
# Build frontend only
npm run build:frontend

# Build frontend (same as above)
npm run build

# Install dependencies for specific workspace
npm run install:frontend
npm run install:backend
```

***

## 14. Alternative: Full Docker Compose Setup

If you prefer to run everything in containers (including frontend/backend):

```bash
# Start all services including frontend/backend in containers
npm run dev

# View logs
npm run logs

# Stop all services
npm run clean
```

**Note:** With Docker Compose, you'll need to rebuild containers after code changes, so the bare-metal approach above is recommended for active development.

---

*Last reviewed: 2026-05-20*
