# OCRA Min# Ocra min

a minimal ## Prerequisites

> **O**Auth2 **C**ode with PKCE **R**eact **A**pplication - **Minimal** Implementation- Docker and Docker Compose

- macOS/Linux/Windows## What's inside

A comprehensive, production-ready OAuth2 PKCE authentication system with React frontend, Node.js backend, and PostgreSQL database integration.- React 19 + Vite app with routing:

  - Home page: starts Authorization Code + PKCE login, handles redirect/exchange, Logout

## 🎯 Overview  - Protected Profile page: only accessible when logged in; shows user info from database

- **Database integration with Prisma:**

OCRA Min demonstrates modern OAuth2 authentication patterns with:  - PostgreSQL database for storing user sessions and profiles

- **Frontend**: React 19 + TypeScript + Vite  - Secure session management (tokens stored server-side, only session ID in browser)

- **Backend**: Node.js + Express + TypeScript  - Login audit logging and session cleanup

- **Database**: PostgreSQL with Prisma ORM  - Browser-compatible demo simulation (for frontend-only testing)

- **Authentication**: OAuth2 PKCE with Keycloak- Keycloak realm export with a SPA client: `react-oauth`

- **Infrastructure**: Docker Compose setup- Dockerfile and docker-compose.yml to run the app, database, and Keycloak together

- Minimal, readable React + TypeScript code

### 🔐 Security Features- Clear comments explaining each step of the flow



- ✅ **OAuth2 PKCE** (Proof Key for Code Exchange) - RFC 7636 compliant## What is PKCE?

- ✅ **Server-side session management** - Tokens stored securely in database

- ✅ **HTTP-only cookies** - Session IDs never exposed to JavaScript**PKCE** (Proof Key for Code Exchange, pronounced "pixie") is a well-established OAuth2 security standard (RFC 7636) that prevents authorization code interception attacks. Instead of using a static client secret (which can't be safely stored in public clients like SPAs), PKCE generates a random code verifier and sends its hash during authorization. This ensures only the app that initiated the flow can exchange the authorization code for tokens. PKCE is widely supported by all major OAuth2 providers and is now the recommended approach for public clients.

- ✅ **CORS protection** - Proper cross-origin request handling

- ✅ **Audit logging** - Complete authentication event tracking## What's insideuth2 PKCE Demo (Keycloak)

- ✅ **Role-based access** - System admin and project management roles

A tiny, well-commented React 19 app showing the OAuth2 Authorization Code Flow with PKCE against Keycloak (or any OIDC/OAuth2 provider).

---

Goals:

## 🚀 Quick Start- Minimal, readable React + TypeScript code

- Clear comments explaining each step of the flow

### Prerequisites- Dockerized app and docker-compose to run with Keycloak locally

- Docker and Docker Compose

- Node.js 18+ (for local development)## What’s inside

- React 19 + Vite app with routing:

### 1. Start the Complete Stack  - Home page: starts Authorization Code + PKCE login, handles redirect/exchange, Logout

  - Protected Profile page: only accessible when logged in; shows name/email from userinfo

```bash- Keycloak realm export with a SPA client: `react-oauth`

# Clone the repository- Dockerfile and docker-compose.yml to run the app and Keycloak side-by-side

git clone <repository-url>

cd OCRA_min## Prerequisites

- Docker and Docker Compose

# Start all services- macOS/Linux/Windows

docker compose up --build -d

```## Quick start with Docker



**Services will be available at:**1) Build and start everything (includes backend API server):

- 🌐 **Frontend**: http://localhost:3001

- 🔌 **Backend API**: http://localhost:3002```sh

- 🔐 **Keycloak Admin**: http://localhost:8081 (admin/admin)docker compose up --build

- 🗄️ **Database**: PostgreSQL on port 5432```



### 2. Create Demo Users- **App**: http://localhost:3001

- **Backend API**: http://localhost:3002 (session management)

1. **Access Keycloak Admin Console**: http://localhost:8081- **Keycloak Admin Console**: http://localhost:8081 (admin / admin)

2. **Login**: admin/admin- **PostgreSQL**: http://localhost:5432 (oauth_demo database)

3. **Switch to Demo Realm**: Select "demo" from realm dropdown

4. **Create Users**:2) Create a user for the demo realm (don’t use admin/admin here)

   - Go to Users → Add user  - Go to Keycloak Admin Console → Realm: demo → Users → Add user.

   - Create users with different roles:  - Set Username (e.g., student), Email (optional), Save.

     - `administrator` (will become system admin)  - Go to the Credentials tab → Set Password → enter a password (e.g., student) and toggle Temporary = Off → Save.

     - `lab-head` (project manager)

     - `museum-director` (project manager)3) Login flow in the app

     - `student` (regular user)  - In the app, click “Login” and enter the user you created (e.g., student/student).

5. **Set Passwords**: Go to Credentials tab for each user    - After login, you’ll be redirected back and the app will display your name/email.

    - Tip: Open the “Profile” page (protected route) to see the user info fetched from the userinfo endpoint.

### 3. Test Authentication Flow

3) Logout

1. **Visit the app**: http://localhost:3001- Click “Logout” to clear local tokens and sign out from Keycloak.

2. **Login**: Click "Login" and use created credentials

3. **Explore features**:## Local development (Vite dev server)

   - View projects (public and managed)

   - Access user administration (admin only)1) Install dependencies:

   - View audit logs```sh

   - Edit project detailsnpm install

```

---

2) Start Keycloak with docker-compose (only Keycloak):

## 🏗️ Architecture```sh

docker compose up keycloak

### Project Structure```

```

OCRA_min/3) Create a `.env` for Vite (optional, see `.env.example`):

├── frontend/          # React 19 + Vite application```sh

│   ├── src/cp .env.example .env

│   │   ├── components/    # Reusable UI components```

│   │   ├── routes/        # Page components

│   │   ├── services/      # API and auth services4) Run the dev server:

│   │   └── types/         # TypeScript definitions```sh

├── backend/           # Node.js + Express APInpm run dev

│   ├── src/```

│   │   ├── controllers/   # Route handlers

│   │   ├── middleware/    # Express middleware- App (dev): http://localhost:5173 (Vite)

│   │   ├── routes/        # API route definitions- Keycloak: http://localhost:8081

│   │   ├── services/      # Business logic

│   │   └── types/         # Shared type definitions**Important**: The Keycloak client `react-oauth` needs both redirect URIs configured:

├── prisma/            # Database schema and migrations- For Docker: `http://localhost:3001/*` and web origin `http://localhost:3001`

├── keycloak/          # Realm configuration- For Vite dev: `http://localhost:5173/*` and web origin `http://localhost:5173`

└── docker/            # Docker configuration files

```If you get "Invalid parameter: redirect_uri" errors during login, check that both URLs are configured in Keycloak Admin Console → Realm: demo → Clients → react-oauth → Valid redirect URIs.



### Technology Stack## Configuration



**Frontend:**The app reads configuration in two ways:

- React 19 with TypeScript

- Vite for development and building- Runtime (when Docker image runs): `config.js` is generated from environment variables by the container entrypoint.

- React Router for navigation  - PROVIDER_URL (e.g. http://localhost:8081)

- Fetch API for HTTP requests  - REALM (e.g. demo)

  - ISSUER (e.g. http://localhost:8081/realms/demo)

**Backend:**  - CLIENT_ID (e.g. react-oauth)

- Node.js with Express  - REDIRECT_URI (e.g. http://localhost:3001)

- TypeScript for type safety  - SCOPE (e.g. "openid profile email")

- Prisma ORM for database operations  - **SYS_ADMIN_EMAIL** (e.g. admin@example.com) - User with this email gets admin privileges on first login

- Cookie-based session management

- Build-time (Vite dev): `.env` using VITE_* variables

**Database:**  - VITE_PROVIDER_URL, VITE_REALM, VITE_CLIENT_ID, VITE_ISSUER, VITE_REDIRECT_URI, VITE_SCOPE

- PostgreSQL for production reliability  - DATABASE_URL for PostgreSQL connection

- Prisma for schema management and migrations  - See `.env.example` for commented defaults matching the dev setup.

- Automatic seeding with demo data

## Admin User Setup

**Authentication:**

- Keycloak as OAuth2/OIDC provider**Dynamic Admin Creation:**

- PKCE flow for securityThe system no longer creates a hardcoded admin user. Instead, admin privileges are granted automatically when the user specified in the `SYS_ADMIN_EMAIL` environment variable logs in for the first time.

- Role-based access control

**How it works:**

---1. Set `SYS_ADMIN_EMAIL=your-admin@example.com` in docker-compose.yml

2. When a user with that email logs in via OAuth, they are automatically granted `sys_admin=true`

## 📋 Features3. This approach works with any OAuth provider and doesn't require pre-creating users



### Authentication & Authorization**Benefits:**

- **OAuth2 PKCE Flow**: Secure authentication without client secrets- ✅ Works with any OAuth email address

- **Session Management**: Server-side token storage with HTTP-only cookies- ✅ No hardcoded credentials in the codebase

- **Role-Based Access**: System admins and project managers- ✅ Admin is created only when they actually log in

- **Audit Logging**: Complete login/logout event tracking- ✅ Easily configurable via environment variables



### Project Management## Database Integration

- **Public/Private Projects**: Visibility control for projects

- **Manager Assignment**: Role-based project managementThis demo now includes **Prisma + PostgreSQL** for secure session management:

- **Edit Permissions**: Managers and admins can edit projects

- **Project Statistics**: View project counts and management data**Security Benefits:**

- OAuth tokens stored server-side in database (not in browser sessionStorage)

### User Administration- Session expiry handled server-side

- **User Listing**: View all system users with statistics- Audit logging of login attempts

- **Last Login Tracking**: Monitor user activity- Automatic cleanup of expired sessions

- **Admin Management**: Dynamic admin privilege assignment

- **Project Assignment Tracking**: See managed projects per user**Database Models:**

- **Users**: OAuth profile information (sub, email, name)

### System Features- **Sessions**: Access tokens, refresh tokens, expiry times

- **Comprehensive Logging**: Request tracing with emoji indicators- **LoginEvents**: Audit log of authentication attempts

- **Error Handling**: Graceful error management and reporting

- **Health Checks**: System status monitoring**Demo Implementation:**

- **Database Migrations**: Version-controlled schema updates- Uses `src/db-browser.ts` for browser-compatible simulation (localStorage)

- Real implementation would use `src/db.ts` with Prisma Client in a Node.js backend

---- Database schema defined in `prisma/schema.prisma`



## 🔧 Configuration## Files to look at



### Environment Variables**Core OAuth + Database:**

- `src/backend.ts` — PKCE flow with backend API session storage

**Backend (docker-compose.yml):**- `src/db-browser.ts` — Browser simulation of database operations (legacy)

```yaml- `src/db.ts` — Real Prisma database operations (for backend use)

DATABASE_URL: "postgresql://oauth_user:oauth_pass@postgres:5432/oauth_demo"- `backend/server.js` — Express.js backend API server

NODE_ENV: "development"- `backend/db.js` — Backend database operations

PORT: 3002- `prisma/schema.prisma` — Database schema definition

SYS_ADMIN_EMAIL: "admin@ocra.it"  # Auto-admin on first login

```**React Components:**

- `src/App.tsx` — UI wiring login, token exchange, session management

**Frontend Runtime (config.js):**- `src/main.tsx` — Router setup (home and protected profile)

```javascript- `src/routes/Profile.tsx` — Protected page showing user data from database

window.CONFIG = {- `src/routes/RequireAuth.tsx` — Route guard with async session validation

  PROVIDER_URL: "http://localhost:8081",

  REALM: "demo",**Infrastructure:**

  ISSUER: "http://localhost:8081/realms/demo",- `public/config.js` — Default runtime config (overridden in Docker via env)

  CLIENT_ID: "react-oauth",- `docker/docker-entrypoint.sh` — Writes `config.js` from env at container start

  REDIRECT_URI: "http://localhost:3001",- `docker-compose.yml` — App + PostgreSQL + Keycloak

  SCOPE: "openid profile email",- `keycloak/realm-export/demo-realm.json` — realm with SPA client pre-configured

  API_BASE: "http://localhost:3002"

};## Notes for teaching

```- The flow uses Authorization Code with PKCE (never store a client secret in SPAs).

- **Security Enhancement**: Tokens are now stored in a database instead of browser sessionStorage.

### Admin User Setup- Only a session ID is stored in sessionStorage, tokens remain server-side for better security.

- We use OIDC Discovery to find endpoints dynamically from the issuer.

**Automatic Admin Assignment:**- Database integration demonstrates production-ready session management patterns.

1. Set `SYS_ADMIN_EMAIL` in environment variables

2. When a user with that email logs in, they automatically receive admin privileges## Troubleshooting

3. No manual database manipulation required- If login fails at token exchange, check the browser devtools network tab for the POST to the token endpoint.

- Make sure the redirect URI and web origins in Keycloak match the app URL (check ports 3001, 5173).

---- If database connection fails, ensure PostgreSQL is running: `docker compose up postgres`

- If Keycloak is slow to start, wait for it to be ready before attempting login (it can take 60-90 seconds on first start).

## 🛠️ Development- The current configuration uses latest Keycloak with `KEYCLOAK_ADMIN`/`KEYCLOAK_ADMIN_PASSWORD` environment variables.

- Check browser console for database simulation logs (prefixed with `[DEMO]`).

### Local Development Setup

## License

```bashMIT
# Install dependencies for all packages
npm run install

# Start individual services
npm run dev:frontend    # Frontend only (port 5173)
npm run dev:backend     # Backend only (port 3002)

# Database operations
npm run db:migrate      # Run pending migrations
npm run db:generate     # Generate Prisma client
npm run db:studio       # Open Prisma Studio
npm run db:reset        # Reset database (⚠️ destructive)
```

### Docker Development

```bash
# Start all services
npm run dev

# View logs
npm run logs              # All services
npm run logs:backend      # Backend only
npm run logs:frontend     # Frontend only

# Clean up
npm run clean
```

### Database Management

**Prisma Commands:**
```bash
# Generate client after schema changes
cd backend && npx prisma generate

# Create and run migrations
cd backend && npx prisma migrate dev --name "description"

# View data in browser
cd backend && npx prisma studio

# Reset database (removes all data)
cd backend && npx prisma migrate reset --force
```

---

## 🧪 API Documentation

### Authentication Endpoints
- `POST /api/sessions` - Create user session from OAuth tokens
- `GET /api/sessions/current` - Get current user session
- `GET /api/sessions/:sessionId` - Get specific session
- `DELETE /api/sessions/:sessionId` - Logout/delete session

### User Management
- `GET /api/users` - List all users (admin only)
- `GET /api/users/stats` - Users with project statistics (admin only)
- `GET /api/users/:userId` - Get user details
- `PUT /api/users/:userId/admin` - Update admin status (admin only)

### Project Management
- `GET /api/projects` - List accessible projects
- `GET /api/projects/:projectId` - Get project details
- `PUT /api/projects/:projectId` - Update project (managers/admin only)

### Audit & Admin
- `GET /api/admin/audit` - Full audit log (admin only)
- `GET /api/users/:userId/audit` - User-specific audit log

---

## 🐛 Troubleshooting

### Common Issues

**Login Failures:**
- Check Keycloak redirect URIs include both `http://localhost:3001/*` and `http://localhost:5173/*`
- Verify realm is set to "demo" not "master"
- Ensure users have passwords set and temporary=false

**Database Connection:**
- Confirm PostgreSQL container is running: `docker compose ps`
- Check database logs: `docker compose logs postgres`
- Verify DATABASE_URL in environment variables

**Session Issues:**
- Clear browser cookies and localStorage
- Check backend logs for session creation/validation
- Verify CORS settings allow credentials

**TypeScript Errors:**
- Run `npx tsc --noEmit` in backend directory
- Ensure Prisma client is generated: `npx prisma generate`
- Check tsconfig.json module resolution settings

### Debug Tools

**Backend Logging:**
The backend includes comprehensive logging with emoji indicators:
- 📥 Incoming requests
- 📤 Outgoing responses  
- 🔍 Database queries
- 🔐 Authentication events
- ⚠️ Warnings and errors

**Database Inspection:**
```bash
# Open Prisma Studio
npm run db:studio

# Or access directly in Docker
docker compose exec backend npx prisma studio
```

---

## 🚦 What's PKCE?

**PKCE** (Proof Key for Code Exchange, pronounced "pixie") is an OAuth2 security extension (RFC 7636) that prevents authorization code interception attacks.

**How it works:**
1. Client generates a random `code_verifier`
2. Client creates `code_challenge` (SHA256 hash of verifier)
3. Authorization request includes the challenge
4. Token exchange requires the original verifier
5. Server verifies the challenge matches the verifier

**Benefits:**
- ✅ No client secret required (perfect for SPAs)
- ✅ Prevents code interception attacks
- ✅ Works with public clients
- ✅ Widely supported by OAuth2 providers

---

## 📜 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Update documentation
5. Submit a pull request

For detailed project structure and development guidelines, see [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md).