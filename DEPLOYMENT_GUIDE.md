# OCRA Deployment Guide

## Development (Local)

```bash
docker compose up
```
Access: http://localhost:3001

## Production (Server with Reverse Proxy)

### Prerequisites
- Docker & Docker Compose installed
- Reverse proxy (Nginx/Traefik) configured
- External network exists: `docker network create host-proxy-net`

### Step 1: Prepare docker-compose.yml

Edit `docker-compose.yml` and modify these sections:

**All services (postgres, mongodb, backend, app, keycloak):**
```yaml
# Comment out:
ports:
  - "3001:80"

# Uncomment:
expose:
  - "80"
networks:
  - host-proxy-net
  - internal-net
```

**Backend only:**
```yaml
volumes:
  # - backend_node_modules:/app/backend/node_modules  # Comment out
  - ./prisma:/app/backend/prisma:ro
  - project_files:/app/project_files
```

**At bottom:**
```yaml
# Uncomment:
networks:
  host-proxy-net:
    external: true
    name: host-proxy-net
  internal-net:
    driver: bridge
```
### Step 2: Configure Keycloak Client

**Why?** Keycloak needs to know which URLs are allowed to redirect and which domains can make API calls.

1. Start Keycloak: `docker-compose up -d keycloak`
2. Access admin console: `http://your-server:8081`
3. Login with credentials from your `.env` file
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

### Step 2: Create .env.prod

```bash
# Database
POSTGRES_DB=ocra_production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<STRONG_PASSWORD>
DATABASE_URL=postgresql://postgres:<STRONG_PASSWORD>@postgres:5432/ocra_production

# MongoDB
MONGODB_URI=mongodb://mongodb:27017/ocra-audit

# Keycloak (placeholder - uses H2 database)
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<STRONG_PASSWORD>

# Backend
SYS_ADMIN_EMAIL=admin@isti.cnr.it
CORS_ORIGINS=https://ocra.isti.cnr.it
NODE_ENV=production

# Frontend
PROVIDER_URL=https://ocra.isti.cnr.it/auth
REALM=demo
ISSUER=https://ocra.isti.cnr.it/auth/realms/demo
CLIENT_ID=react-oauth
REDIRECT_URI=https://ocra.isti.cnr.it
SCOPE=openid profile email
# NOTE: VITE_API_BASE can be omitted when using reverse proxy
# The frontend will automatically use the same origin (https://ocra.isti.cnr.it)
# VITE_API_BASE=https://ocra.isti.cnr.it
```

### Step 3: Deploy

```bash
# Upload files
rsync -avz --exclude 'node_modules' --exclude '.git' ./ user@server:~/ocra/

# SSH to server
ssh user@server
cd ~/ocra

# Start services
docker compose --env-file .env.prod up -d --build

# Check logs
docker compose logs -f
```

### Step 4: Configure Reverse Proxy

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

    location /auth/ {
        proxy_pass http://ocra-keycloak:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 5: Initialize Database

```bash
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed  # Optional
```

## Key Differences

| Aspect | Development | Production |
|--------|-------------|------------|
| **Ports** | Published to host | Exposed to networks only |
| **Networks** | Default bridge | host-proxy-net + internal-net |
| **node_modules** | Volume mounted | Built into image |
| **Keycloak** | H2 database | H2 database (placeholder) |
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

## Maintenance

```bash
# View logs
docker compose logs -f [service]

# Restart service
docker compose restart [service]

# Backup database
docker compose exec postgres pg_dump -U postgres ocra_production > backup.sql

# Update
docker compose up -d --build
```

## Notes

- Keycloak is a **placeholder** for demo - replace with real auth server for production
- Database backups should be automated
- Use HTTPS in production (configure SSL in reverse proxy)
- Keycloak uses built-in H2 database (simpler, fine for placeholder use)
