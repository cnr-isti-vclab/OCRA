# OCRA Deployment Guide

## Development (Local)

Docker Compose automatically uses `docker-compose.yml` and `docker-compose.override.yml`.

```bash
docker compose --env-file .env.egi-demo up
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
- `docker-compose.override.yml`: Development overrides (ports exposed, Prisma schema access).
- `docker-compose.prod.yml`: Production overrides (restart policies and networks).

### EGI Check-in authentication

Development uses the shared EGI Check-in Demo client from `.env.egi-demo`. Production requires a distinct client
registered for the production HTTPS redirect URI and uses issuer `https://aai.egi.eu/auth/realms/egi`.

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
# Keep the demo project out of production by default
RUN_DEMO_PROJECT_SEED=false
# Optional demo override: every authenticated user is treated as creator at runtime
DEMO_ALL_USERS_CREATOR=true
# Optional: when RUN_DEMO_PROJECT_SEED=true, assign the demo project to this real user
# DEMO_PROJECT_MANAGER_EMAIL=real.creator@example.org

# Auth
ISSUER=https://aai.egi.eu/auth/realms/egi
CLIENT_ID=<EGI_PRODUCTION_CLIENT_ID>
CLIENT_SECRET=<STRONG_SECRET>

# Frontend
REDIRECT_URI=https://ocra.isti.cnr.it
SCOPE=openid voperson_id email profile entitlements
# NOTE: VITE_API_BASE can be omitted when using reverse proxy
# VITE_API_BASE=https://ocra.isti.cnr.it
```

If you also use Docker Compose for the backend runtime, note that the
`backend` service loads `backend/.env` as its shared application-level env file.
Keep backend feature flags such as `DEMO_ALL_USERS_CREATOR` there when you want
the same value in both bare-metal and Compose runs. Infrastructure values such
as `DATABASE_URL`, `MONGO_URL`, and `ISSUER` continue to be overridden by the
Compose service definition.

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
| **OIDC provider** | EGI Check-in Demo | EGI Check-in Production |
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

- Database backups should be automated
- Use HTTPS in production (configure SSL in reverse proxy)
