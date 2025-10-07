# OCRA Deployment Guide

## 🚀 Deploying to a Production Server

### Step 1: Create Environment Configuration

On your server, create a `.env` file in the project root:

```bash
cd /path/to/OCRA
nano .env
```

Add the following content (replace with your server details):

```env
# Server Configuration
PROVIDER_URL=http://ocra.mydomain.org:8081
REALM=demo
ISSUER=http://ocra.mydomain.org:8081/realms/demo
CLIENT_ID=react-oauth
REDIRECT_URI=http://ocra.mydomain.org:3001
SCOPE=openid profile email
VITE_API_BASE=http://ocra.mydomain.org:3002

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/oauth_demo
POSTGRES_DB=oauth_demo
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Keycloak Admin Credentials
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=yourpassword

# System Admin Email
SYS_ADMIN_EMAIL=admin@ocra.it
```

### Step 2: Configure Keycloak Valid Redirect URIs

**Important:** You need to update Keycloak's client configuration to allow redirects from your domain.

1. Access Keycloak admin console: `http://ocra.mydomain.org:8081`
2. Login with: `admin` / `admin`
3. Select the `demo` realm from the dropdown
4. Go to: **Clients** → **react-oauth**
5. Update the following fields:
   - **Valid redirect URIs**: `http://ocra.mydomain.org:3001/*`
   - **Valid post logout redirect URIs**: `http://ocra.mydomain.org:3001/*`
   - **Web origins**: `http://ocra.mydomain.org:3001`
6. Click **Save**

### Step 3: Restart the Services

```bash
# Stop existing containers
docker-compose down

# Rebuild and start with new configuration
docker-compose up --build -d

# Check logs
docker-compose logs -f app
```

### Step 4: Verify Configuration

1. Check that config.js is generated correctly:
   ```bash
   docker exec ocra-frontend cat /usr/share/nginx/html/config.js
   ```
   
   You should see your server URLs (not localhost).

2. Access your application: `http://ocra.mydomain.org:3001`

3. Click "Login with Keycloak" - it should redirect to your Keycloak server

### Troubleshooting

#### Login button does nothing
- **Cause**: Frontend still using localhost URLs
- **Fix**: Verify the `.env` file exists and restart: `docker-compose restart app`
### Troubleshooting

#### Login button does nothing / Nothing happens when clicking login
This is the most common issue. Follow these steps:

**Step 1: Run the debug script**
```bash
chmod +x debug-deployment.sh
./debug-deployment.sh
```

**Step 2: Check browser console**
1. Open your browser's Developer Tools (F12)
2. Go to the Console tab
3. Type: `window.__APP_CONFIG__`
4. Verify it shows your server URLs (not localhost)

**Example of CORRECT output:**
```javascript
{
  providerUrl: "http://visualmediaservice.isti.cnr.it:8081",
  issuer: "http://visualmediaservice.isti.cnr.it:8081/realms/demo",
  redirectUri: "http://visualmediaservice.isti.cnr.it:3001",
  // ...
}
```

**Example of WRONG output (has localhost):**
```javascript
{
  providerUrl: "http://localhost:8081",  // ❌ WRONG!
  // ...
}
```

**Step 3: Check Network tab when clicking Login**
1. Open Developer Tools → Network tab
2. Click "Login with Keycloak"
3. Look at the redirect URL in the requests

**Should redirect to:**
```
http://visualmediaservice.isti.cnr.it:8081/realms/demo/protocol/openid-connect/auth?...
```

**If it redirects to localhost:8081**, your config.js is wrong.

**Fix:**
```bash
# On your server
cd /path/to/OCRA

# Verify .env exists and has correct values
cat .env

# Rebuild containers to regenerate config.js
docker-compose down
docker-compose up --build -d

# Verify config.js was regenerated
docker exec ocra-frontend cat /usr/share/nginx/html/config.js

# Should show your domain, not localhost
```

#### CORS errors in browser console
**Error message:**
```
Access to fetch at 'http://...:8081/...' from origin 'http://...:3001' has been blocked by CORS policy
```

**Cause**: Keycloak Web Origins not configured correctly

**Fix:**
1. Go to Keycloak admin: `http://your-server:8081`
2. Login: `admin` / `your-password`
3. Select **demo** realm
4. **Clients** → **react-oauth** → **Settings** tab
5. Scroll to **Web origins**
6. Add: `http://visualmediaservice.isti.cnr.it:3001`
   - ⚠️ NO trailing slash
   - ⚠️ NO `/*` at the end
   - Just the base URL
7. Click **Save**
8. Try login again (may need to clear browser cache)

#### "Invalid redirect_uri" error from Keycloak
**Error message:**
```
Invalid parameter: redirect_uri
```

**Cause**: The redirect URI in your request doesn't match Keycloak's configured URIs

**Fix:**
1. Check what redirect_uri is being sent:
   - Open browser Developer Tools → Network tab
   - Click Login
   - Find the request to `/auth` endpoint
   - Check the `redirect_uri` parameter

2. Go to Keycloak admin console
3. **Clients** → **react-oauth** → **Settings**
4. Check **Valid redirect URIs** field
5. It should contain: `http://visualmediaservice.isti.cnr.it:3001/*`
   - ⚠️ Must include the `/*` wildcard
   - ⚠️ Must match EXACTLY what's in your `.env` file

6. Also set **Valid post logout redirect URIs**: `http://visualmediaservice.isti.cnr.it:3001/*`

7. Click **Save**

#### Keycloak shows "We're sorry..." page
**Error message:**
```
We're sorry...
Invalid parameter: redirect_uri
```

**This means Keycloak is accessible, but redirect URI is wrong.**

**Double-check:**
```bash
# On server, check your .env
grep REDIRECT_URI .env
# Output should be: REDIRECT_URI=http://visualmediaservice.isti.cnr.it:3001

# Check Keycloak client config matches
# Web UI: Clients → react-oauth → Valid redirect URIs
# Should have: http://visualmediaservice.isti.cnr.it:3001/*
```

#### Still seeing localhost in config.js after rebuild
**Cause**: .env file not in the correct location or has wrong format

**Fix:**
```bash
# On server
cd /path/to/OCRA  # Must be the directory with docker-compose.yml

# Check if .env is here
ls -la .env

# Verify format (no spaces around =, no quotes)
cat .env

# Check for hidden characters
cat -A .env | head -5

# Rebuild with verbose output
docker-compose down
docker-compose build app --no-cache
docker-compose up -d

# Immediately check config.js
docker exec ocra-frontend cat /usr/share/nginx/html/config.js
```

#### Cannot access Keycloak admin console
**Error**: Connection refused or timeout to port 8081

**Check:**
```bash
# Is Keycloak running?
docker ps | grep keycloak

# Check Keycloak logs
docker logs ocra-keycloak

# Test from server itself
curl http://localhost:8081/realms/demo/.well-known/openid-configuration

# If this works, it's a firewall issue
```

**Fix firewall (if needed):**
```bash
# Ubuntu/Debian
sudo ufw allow 8081/tcp

# CentOS/RHEL
sudo firewall-cmd --add-port=8081/tcp --permanent
sudo firewall-cmd --reload
```

- **Check**: Inspect config.js as shown in Step 4.1

### Port Configuration

- **Frontend (nginx)**: 3001
- **Backend (API)**: 3002
- **Keycloak**: 8081
- **PostgreSQL**: 5432
- **MongoDB**: 27017
- **Prisma Studio**: 5555

### Security Notes for Production

**⚠️ Before deploying to production:**

1. **Use HTTPS**: Configure SSL/TLS certificates
2. **Change default passwords**:
   - Update `POSTGRES_PASSWORD`
   - Update `KEYCLOAK_ADMIN_PASSWORD`
3. **Secure Keycloak**: Use production mode instead of dev mode
4. **Restrict access**: Configure firewall rules for database ports
5. **Backup**: Set up regular database backups

### Using HTTPS

If your server has HTTPS configured, update the `.env` file to use `https://` URLs:

```env
PROVIDER_URL=https://ocra.mydomain.org:8443
ISSUER=https://ocra.mydomain.org:8443/realms/demo
REDIRECT_URI=https://ocra.mydomain.org
VITE_API_BASE=https://ocra.mydomain.org/api
```

Also update Keycloak client configuration accordingly.

### Health Checks

Check if all services are running:

```bash
docker ps

# Should show all 5 containers as "Up" and healthy:
# - ocra-frontend
# - ocra-backend  
# - ocra-keycloak
# - ocra-postgres
# - ocra-mongodb
```

### Logs

View logs for debugging:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f backend
docker-compose logs -f keycloak
```

### Advanced Debugging: OAuth Flow Analysis

If login still doesn't work after all the above, trace the OAuth flow:

#### 1. Check what happens when you click "Login"

In browser Developer Tools → Network tab:

**Expected flow:**
1. Click "Login with Keycloak"
2. Browser should redirect to Keycloak with parameters
3. After login, Keycloak redirects back to your app with a code
4. App exchanges code for token

**Step-by-step check:**
```javascript
// In browser console, before clicking login:
// Check if config is correct
console.log(window.__APP_CONFIG__);

// Should show your server URLs

// After clicking login, if nothing happens:
// Check if there's an error in console
// Common: "Failed to fetch" or CORS errors
```

#### 2. Manual OAuth URL test

Try constructing the OAuth URL manually:

```
http://visualmediaservice.isti.cnr.it:8081/realms/demo/protocol/openid-connect/auth?client_id=react-oauth&redirect_uri=http://visualmediaservice.isti.cnr.it:3001&response_type=code&scope=openid+profile+email&code_challenge=TEST&code_challenge_method=S256
```

If this URL works in your browser, the OAuth endpoint is accessible.

#### 3. Check Keycloak realm settings

In Keycloak admin console:
1. **Realm Settings** → **General** tab
2. Verify **Frontend URL** is empty or set correctly
3. Go to **Clients** → **react-oauth**
4. **Settings** tab → Check **Access Type** is `public`
5. **Advanced Settings** → Verify **PKCE** settings

#### 4. Common Keycloak misconfigurations

**Wrong:**
- Valid Redirect URIs: `http://visualmediaservice.isti.cnr.it:3001` (missing /*)
- Web Origins: `http://visualmediaservice.isti.cnr.it:3001/*` (should not have /*)
- Valid Redirect URIs: `visualmediaservice.isti.cnr.it:3001/*` (missing http://)

**Correct:**
- Valid Redirect URIs: `http://visualmediaservice.isti.cnr.it:3001/*`
- Valid Post Logout Redirect URIs: `http://visualmediaservice.isti.cnr.it:3001/*`
- Web Origins: `http://visualmediaservice.isti.cnr.it:3001`

#### 5. Test with curl

From your server:

```bash
# Test Keycloak OpenID configuration
curl http://localhost:8081/realms/demo/.well-known/openid-configuration

# Should return JSON with endpoints

# Test from outside the server (from your computer)
curl http://visualmediaservice.isti.cnr.it:8081/realms/demo/.well-known/openid-configuration

# Should return the same JSON
# If it doesn't, there's a network/firewall issue
```

#### 6. Enable verbose logging

Add to `.env`:
```env
# Enable debug logging
LOG_LEVEL=debug
```

Then:
```bash
docker-compose restart app backend
docker-compose logs -f app
```

Look for OAuth-related log messages when clicking login.

### Quick Checklist for "Login doesn't work"

- [ ] `.env` file exists in project root (same directory as docker-compose.yml)
- [ ] `.env` has your server URLs (not localhost)
- [ ] `docker exec ocra-frontend cat /usr/share/nginx/html/config.js` shows your URLs
- [ ] Browser console `window.__APP_CONFIG__` shows your URLs
- [ ] Keycloak is accessible: `http://your-server:8081`
- [ ] Keycloak client `react-oauth` has:
  - [ ] Valid Redirect URIs: `http://your-server:3001/*`
  - [ ] Valid Post Logout Redirect URIs: `http://your-server:3001/*`
  - [ ] Web Origins: `http://your-server:3001`
  - [ ] Access Type: `public`
- [ ] No CORS errors in browser console
- [ ] Network tab shows redirect to your-server:8081 (not localhost:8081)
- [ ] All 5 containers are running: `docker ps`
- [ ] No error logs: `docker-compose logs app backend keycloak`

If all checkboxes are checked and it still doesn't work, open an issue with:
- Output of `debug-deployment.sh`
- Browser console screenshot
- Network tab screenshot
- Keycloak client configuration screenshot

