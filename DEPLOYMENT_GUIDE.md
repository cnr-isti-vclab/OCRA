# OCRA Deployment Guide

## Development (Local)

Docker Compose automatically uses `docker-compose.yml` and `docker-compose.override.yml`.

```bash
docker compose up
```
Access: http://localhost:3001

## Production (Server with Reverse Proxy)

### Prerequisites
- Docker & Docker Compose installed
- Reverse proxy (Nginx/Traefik) configured
- External network exists: `docker network create host-proxy-net`

### Deployment

We use a separate production configuration file that extends the base configuration.

1. **Create `.env.prod` file** with production secrets (see Step 1 below).

2. **Deploy using the production override:**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

### Configuration Files Structure

- `docker-compose.yml`: Base configuration (Core services, no ports exposed).
- `docker-compose.override.yml`: Development overrides (Local Keycloak, ports exposed, Prisma schema access).
- `docker-compose.prod.yml`: Production overrides (Restart policies, networks, no Keycloak).

### Customizing for EGI / External Auth

If you are using an external Identity Provider (like EGI) instead of the local Keycloak:
1. The `keycloak` service is NOT included in `docker-compose.yml` or `docker-compose.prod.yml`, so it won't start.
2. Configure `backend` and `app` in `.env.prod` to point to the external provider:
   - `ISSUER=https://aai.egi.eu/auth/realms/egi`
   - `PROVIDER_URL=...`

### Development Only: Configure Local Keycloak Client

**Why?** Keycloak needs to know which URLs are allowed to redirect and which domains can make API calls.

1. Start Keycloak: `docker compose up -d keycloak`
2. Access admin console: `http://your-server:8081`
3. Login with default credentials (`admin` / `admin`), or override via `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` in `.env.prod`
4. Select **demo** realm from dropdown (top-left)
5. Go to **Clients** → **react-oauth**
6. Configure these settings:

   | Setting | Value | Notes |
   |---------|-------|-------|
   | **Valid redirect URIs** | `http://your-server:3001/*` | Must include `/*` wildcard |
   | **Valid post logout redirect URIs** | `http://your-server:3001/*` | Must match redirect URIs |
   | **Web origins** | `http://your-server:3001` | NO trailing slash or `/*` |
   | **PKCE Code Challenge Method** | `plain` or blank | Required for HTTP deployments |

7. Click **Save**

**PKCE Method Explanation:**
- HTTP sites cannot use `crypto.subtle` API (browser security)
- `plain` method works on HTTP (less secure but functional)
- `S256` method requires HTTPS (more secure)
- Leave blank to accept both methods

### Step 1: Create `.env.prod`

```bash
# Database
POSTGRES_DB=ocra_production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<STRONG_PASSWORD>
DATABASE_URL=postgresql://postgres:<STRONG_PASSWORD>@postgres:5432/ocra_production

# MongoDB
MONGO_URL=mongodb://mongodb:27017
MONGO_AUDIT_DB=ocra_audit
MONGO_CONTENT_DB=ocra_content

# Backend
SYS_ADMIN_EMAIL=admin@isti.cnr.it
CORS_ORIGINS=https://ocra.isti.cnr.it
NODE_ENV=production
# Keep demo users/projects out of production by default
RUN_DEMO_PROJECT_SEED=false
RUN_DEMO_USERS_SEED=false
# Optional: when RUN_DEMO_PROJECT_SEED=true, assign the demo project to this real user
# DEMO_PROJECT_MANAGER_EMAIL=real.creator@example.org

# Auth
ISSUER=https://ocra.isti.cnr.it/auth/realms/demo
CLIENT_ID=react-oauth
CLIENT_SECRET=<STRONG_SECRET>

# Frontend
PROVIDER_URL=https://ocra.isti.cnr.it/auth
REALM=demo
REDIRECT_URI=https://ocra.isti.cnr.it
SCOPE=openid profile email
# NOTE: VITE_API_BASE can be omitted when using reverse proxy
# VITE_API_BASE=https://ocra.isti.cnr.it
```

### Optional: Pre-register creator users for first deployment

If you want specific real users to already have `sys_creator` rights before their first login:

1. Copy:
   - `backend/config/system-users.example.json`
   to:
   - `backend/config/system-users.json`
2. Fill it with the real people to pre-register.
3. Keep the real file uncommitted; it is ignored by Git.

At container startup, OCRA will read `backend/config/system-users.json` if present and upsert those users by email. New entries are created with a temporary `pending:*` subject and are linked to the real OAuth `sub` on first successful login.

### Optional: Seed the demo project without demo users

For a production-like deployment where the Galassi demo project is useful but fake demo users are not, use:

```bash
RUN_DEMO_PROJECT_SEED=true
RUN_DEMO_USERS_SEED=false
DEMO_PROJECT_MANAGER_EMAIL=<one email from backend/config/system-users.json>
```

This seeds the demo project and assigns its manager role to the configured real user. If no manager email/sub is configured, OCRA falls back to the first existing `sys_admin` or `sys_creator` user.

> **Note:** If the MongoDB volume already exists, rerun the bootstrap after deployment to ensure `ocra_audit`, `ocra_content`, and the annotation collections exist:
> ```bash
> npm run mongo:init
> ```

### Step 2: Deploy

```bash
# Upload files
rsync -avz --exclude 'node_modules' --exclude '.git' ./ user@server:~/ocra/

# SSH to server
ssh user@server
cd ~/ocra

# Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Check logs
docker compose logs -f
```

### Step 3: Configure Reverse Proxy

Ask admin to route traffic (example for Nginx):

```nginx
server {
    listen 443 ssl http2;
    server_name ocra.isti.cnr.it;

    location / {
        proxy_pass http://ocra-frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://ocra-backend:3002/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Only needed if running a local Keycloak (development or self-hosted auth).
    # For external IdPs (e.g. EGI), remove this block.
    location /auth/ {
        proxy_pass http://ocra-keycloak:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 4: Initialize Database

```bash
docker compose exec backend npx prisma db push
```

Do not run `npm run seed` on production unless you intentionally want the local demo users and demo project content. Use `backend/config/system-users.json` instead for real creator/admin accounts.

## Key Differences

| Aspect | Development | Production |
|--------|-------------|------------|
| **Ports** | Published to host | Exposed to networks only |
| **Networks** | Default bridge | host-proxy-net + internal-net |
| **node_modules** | Volume mounted | Built into image |
| **Keycloak** | Local (H2 database) | Not included |
| **Demo seed** | Demo users + project enabled by override | Disabled by default; project can be enabled without demo users |
| **Passwords** | Default | Strong required |
| **URLs** | localhost | domain.com |

## Troubleshooting

**Backend crashes with "Cannot find package 'n3'":**
- Ensure `backend_node_modules` volume is commented out in production

**"Ports must be a array" error:**
- Ensure `ports:` lines are commented with `#`
- Ensure `expose:` lines are uncommented

**Services can't communicate:**
```bash
docker network inspect host-proxy-net
docker compose exec backend ping postgres
```

**CORS errors:**
- Check `CORS_ORIGINS` in .env.prod matches your domain

**`CLIENT_SECRET` warning during `docker compose up`:**
- Compose is not reading your production env file.
- Start production with:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build
  ```

**"npm error code EUSAGE" or "npm ci" failed during build:**
- This means `package-lock.json` is out of sync with `package.json`.
- **Fix**:
  1. Run `npm install` in `frontend/` and `backend/` locally.
  2. Commit the updated lockfiles.
  3. Push to the server and pull before rebuilding.

## Maintenance

```bash
# View logs
docker compose logs -f [service]

# Restart service
docker compose restart [service]

# Backup database
docker compose exec postgres pg_dump -U postgres ocra_production > backup.sql

# Update
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Notes

- Keycloak is a **placeholder** for demo - replace with real auth server for production
- Database backups should be automated
- Use HTTPS in production (configure SSL in reverse proxy)
- Keycloak uses built-in H2 database (simpler, fine for placeholder use)
