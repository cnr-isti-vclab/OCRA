# OCRA Deployment Guide

## � Table of Contents

1. [Quick Start](#quick-start)
2. [Step-by-Step Deployment](#step-by-step-deployment)
3. [Verification](#verification)
4. [Troubleshooting](#troubleshooting)
5. [Security & Production Notes](#security--production-notes)
6. [Advanced Configuration](#advanced-configuration)

---

## Quick Start

**TL;DR for experienced users:**

```bash
# 1. Clone and create .env
cd /path/to/OCRA
cp .env.production.example .env
# Edit .env with your server URLs

# 2. Configure Keycloak
# Access http://your-server:8081
# Update react-oauth client: redirect URIs, web origins, PKCE method to "plain"

# 3. Deploy
docker-compose up -d --build

# 4. Verify
docker exec ocra-frontend cat /usr/share/nginx/html/config.js
# Should show your server URLs, not localhost
```

---

## 🚀 Step-by-Step Deployment

### Step 1: Create Environment Configuration

Create a `.env` file in the project root (same directory as `docker-compose.yml`):

```bash
cd /path/to/OCRA
nano .env
```

**Minimal required configuration:**

```env
# OAuth/Keycloak Configuration
PROVIDER_URL=http://your-server.com:8081
ISSUER=http://your-server.com:8081/realms/demo
REDIRECT_URI=http://your-server.com:3001
VITE_API_BASE=http://your-server.com:3002
CORS_ORIGINS=http://your-server.com:3001

# Keycloak Admin
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=changeme

# System Admin Email (gets admin privileges on first login)
SYS_ADMIN_EMAIL=admin@your-domain.com
```

<details>
<summary>See full .env template with all options</summary>

```env
# Server Configuration
SERVER_HOST=your-server.com
PROVIDER_URL=http://your-server.com:8081
REALM=demo
ISSUER=http://your-server.com:8081/realms/demo
CLIENT_ID=react-oauth
REDIRECT_URI=http://your-server.com:3001
SCOPE=openid profile email

# Frontend & Backend URLs
VITE_API_BASE=http://your-server.com:3002
CORS_ORIGINS=http://your-server.com:3001

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/oauth_demo
POSTGRES_DB=oauth_demo
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Keycloak Admin Credentials
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=changeme

# System Admin Email
SYS_ADMIN_EMAIL=admin@your-domain.com
```

</details>

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

### Step 3: Deploy Application

**Important:** Use `docker-compose down && up` (not `restart`) to load new environment variables.

```bash
# Stop existing containers
docker-compose down

# Start all services with new configuration
docker-compose up -d --build

# Monitor logs
docker-compose logs -f
```

**Container startup order:**
1. postgres, mongodb (databases)
2. keycloak (authentication)
3. backend (API server)
4. frontend (nginx web server)

---

## ✅ Verification

### 1. Check All Containers Are Running

```bash
docker ps
```

Expected output:
```
ocra-frontend   Up X minutes   0.0.0.0:3001->80/tcp
ocra-backend    Up X minutes   0.0.0.0:3002->3002/tcp
ocra-keycloak   Up X minutes   0.0.0.0:8081->8080/tcp
ocra-postgres   Up X minutes   (healthy)
ocra-mongodb    Up X minutes   (healthy)
```

### 2. Verify Configuration Was Applied

```bash
# Check frontend config.js
docker exec ocra-frontend cat /usr/share/nginx/html/config.js
```

**Should show:**
```javascript
window.__APP_CONFIG__ = {
  providerUrl: "http://your-server:8081",  // ← Your domain
  issuer: "http://your-server:8081/realms/demo",
  redirectUri: "http://your-server:3001",
  apiBase: "http://your-server:3002"  // ← Your domain
};
```

**NOT localhost!** If you see localhost, the .env file wasn't loaded properly.

### 3. Test Application

1. Open browser: `http://your-server:3001`
2. Click "Login with Keycloak"
3. Should redirect to Keycloak login page
4. Enter credentials (use email from `SYS_ADMIN_EMAIL`)
5. Should redirect back and show project list

---

## 🔧 Troubleshooting

### Common Issues & Solutions

<details>
<summary><strong>❌ Login button does nothing</strong></summary>

**Check browser console:**
```javascript
window.__APP_CONFIG__
// Should show your server URLs, not localhost
```

**If it shows localhost:**
1. Verify `.env` file is in same directory as `docker-compose.yml`
2. Recreate containers: `docker-compose down && docker-compose up -d --build`
3. Hard refresh browser: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
4. Try incognito mode

</details>

<details>
<summary><strong>❌ CORS Error: "blocked by CORS policy"</strong></summary>

**Error message:**
```
Access to fetch at 'http://your-server:3002/api/sessions' from origin 'http://your-server:3001'
has been blocked by CORS policy
```

**Solution:**
1. Add to `.env`:
   ```env
   CORS_ORIGINS=http://your-server:3001
   ```
2. Restart backend: `docker-compose restart backend`

</details>

<details>
<summary><strong>❌ "Invalid redirect_uri" from Keycloak</strong></summary>

**Keycloak shows:** "We're sorry... Invalid parameter: redirect_uri"

**Solution:**
1. Go to Keycloak admin → Clients → react-oauth
2. Check **Valid redirect URIs**: Must be `http://your-server:3001/*` (with `/*`)
3. Check it matches your `.env` REDIRECT_URI exactly
4. Click Save

</details>

<details>
<summary><strong>❌ "code challenge method is not matching"</strong></summary>

**Error in URL:**
```
?error=invalid_request&error_description=Invalid+parameter%3A+code+challenge+method
```

**Solution:**
1. Go to Keycloak admin → Clients → react-oauth → Advanced tab
2. Find "Proof Key for Code Exchange Code Challenge Method"
3. Change to **plain** (or leave blank)
4. Click Save

**Why?** HTTP deployments can't use S256 because browsers block `crypto.subtle` on non-HTTPS.

</details>

<details>
<summary><strong>❌ Config.js still has localhost after rebuild</strong></summary>

**Complete reset:**
```bash
# Stop everything
docker-compose down -v

# Remove frontend image
docker rmi ocra-app

# Verify .env
cat .env | grep -E "(VITE_API_BASE|ISSUER|REDIRECT_URI)"

# Rebuild from scratch
docker-compose up -d --build

# Verify immediately
docker exec ocra-frontend cat /usr/share/nginx/html/config.js
```

</details>

<details>
<summary><strong>❌ Browser cache won't clear</strong></summary>

**Try these in order:**

1. **Hard refresh**: Ctrl+Shift+R or Cmd+Shift+R
2. **Clear site data**: DevTools (F12) → Application → Clear storage
3. **Incognito mode**: Open in private/incognito window
4. **Different browser**: Try Firefox/Chrome/Safari
5. **Different device**: Use phone or another computer
6. **Add cache buster**: `http://your-server:3001?v=2`

</details>

### Diagnostic Commands

Run these on your server to diagnose issues:

```bash
# 1. Check .env file exists and has correct syntax
cat .env

# 2. Verify environment variables in container
docker exec ocra-frontend env | grep -E "(ISSUER|VITE_API_BASE)"

# 3. Check actual config.js
docker exec ocra-frontend cat /usr/share/nginx/html/config.js

# 4. Check backend CORS settings
docker logs ocra-backend | grep -i cors

# 5. Check all containers are healthy
docker ps

# 6. Check for errors in logs
docker-compose logs --tail=50 app backend
```

### Debug Script

Use the included debug script for comprehensive diagnostics:

```bash
chmod +x debug-deployment.sh
./debug-deployment.sh
```

---

## 🔒 Security & Production Notes

### Before Production Deployment

**⚠️ Critical Security Tasks:**

1. **Enable HTTPS**
   - Configure SSL/TLS certificates
   - Update `.env` URLs to use `https://`
   - Set `secure: true` in cookie configuration
   - Change Keycloak PKCE method back to `S256`

2. **Change Default Passwords**
   ```env
   POSTGRES_PASSWORD=<strong-password>
   KEYCLOAK_ADMIN_PASSWORD=<strong-password>
   ```

3. **Secure Keycloak**
   - Switch from dev mode to production mode
   - Configure proper database (not H2)
   - Enable HTTPS for Keycloak

4. **Restrict Access**
   - Configure firewall rules
   - Close unnecessary ports (5432, 27017 should not be public)
   - Use private networks for database containers

5. **Enable Backups**
   - Set up automated database backups
   - Test restoration procedures

### Port Configuration

| Service | Port | Public? | Purpose |
|---------|------|---------|---------|
| Frontend | 3001 | ✅ Yes | Web UI |
| Backend | 3002 | ✅ Yes | REST API |
| Keycloak | 8081 | ✅ Yes | Authentication |
| PostgreSQL | 5432 | ❌ No | Database |
| MongoDB | 27017 | ❌ No | Audit logs |
| Prisma Studio | 5555 | ❌ No | DB admin (dev only) |

### HTTPS Configuration

Example `.env` for HTTPS:

```env
PROVIDER_URL=https://your-domain.com
ISSUER=https://your-domain.com/realms/demo
REDIRECT_URI=https://your-domain.com
VITE_API_BASE=https://your-domain.com/api
CORS_ORIGINS=https://your-domain.com
```

You'll also need:
- SSL certificates (Let's Encrypt, etc.)
- Reverse proxy (nginx, Caddy, Traefik)
- Updated Keycloak client configuration

---

## ⚙️ Advanced Configuration

### Multiple Environments

For multiple origins (development + production):

```env
CORS_ORIGINS=http://localhost:3001,http://your-server:3001,https://your-domain.com
```

### Custom Database

To use external PostgreSQL:

```env
DATABASE_URL=postgresql://user:password@your-db-server:5432/ocra_db
```

### Environment Variables Reference

<details>
<summary>Click to see all available environment variables</summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `PROVIDER_URL` | `http://localhost:8081` | Keycloak base URL |
| `ISSUER` | `http://localhost:8081/realms/demo` | OAuth issuer URL |
| `REDIRECT_URI` | `http://localhost:3001` | OAuth redirect after login |
| `VITE_API_BASE` | `http://localhost:3002` | Backend API URL |
| `CORS_ORIGINS` | `http://localhost:3001` | Allowed CORS origins (comma-separated) |
| `DATABASE_URL` | PostgreSQL connection string | Main database connection |
| `KEYCLOAK_ADMIN` | `admin` | Keycloak admin username |
| `KEYCLOAK_ADMIN_PASSWORD` | `admin` | Keycloak admin password |
| `SYS_ADMIN_EMAIL` | `admin@ocra.it` | Email of system administrator |
| `CLIENT_ID` | `react-oauth` | OAuth client identifier |
| `REALM` | `demo` | Keycloak realm name |
| `SCOPE` | `openid profile email` | OAuth scopes |

</details>

### Logs and Monitoring

```bash
# View all logs
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f backend  
docker-compose logs -f keycloak

# Last 100 lines
docker-compose logs --tail=100

# With timestamps
docker-compose logs -f -t
```

### Health Checks

```bash
# Backend health
curl http://localhost:3002/health

# Keycloak OpenID configuration
curl http://localhost:8081/realms/demo/.well-known/openid-configuration

# Frontend (should return HTML)
curl http://localhost:3001
```

---

## 📚 Additional Resources

- [OAuth 2.0 PKCE Flow](https://oauth.net/2/pkce/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

---

## 🆘 Getting Help

If you're still having issues after following this guide:

1. Run the debug script: `./debug-deployment.sh`
2. Check browser console (F12) for errors
3. Check Docker logs: `docker-compose logs`
4. Open an issue with:
   - Debug script output
   - Browser console screenshot
   - Network tab screenshot  
   - Keycloak client configuration screenshot



