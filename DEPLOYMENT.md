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
- **Check**: Inspect config.js as shown in Step 4.1

#### CORS errors
- **Cause**: Keycloak not configured with correct redirect URIs
- **Fix**: Follow Step 2 carefully

#### "Invalid redirect_uri"
- **Cause**: Keycloak client configuration mismatch
- **Fix**: Ensure redirect URIs in Keycloak match `REDIRECT_URI` in `.env`

#### Still seeing localhost in logs
- **Cause**: Environment variables not loaded
- **Fix**: 
  ```bash
  docker-compose down
  docker-compose up --build -d
  ```

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
