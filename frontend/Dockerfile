# Build stage (Node LTS)
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY frontend/openlime/package.json frontend/openlime/package.json
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json

# Install dependencies
RUN npm ci

# Copy shared types (needed for scene-types and scene-migration)
# Note: In Docker, we build the frontend from the workspace root so npm resolves
# the frontend, shared, and local openlime packages from the locked workspace tree.
COPY shared/ shared/

# Copy frontend source and build
COPY frontend/ frontend/
# Build openlime (local file: dependency - needs rollup to generate dist/js)
RUN cd frontend/openlime && npm install && npm run rollup
RUN npm run build --workspace frontend

# Runtime stage (latest Nginx on Alpine)
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /app/frontend/dist/ .
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/docker-entrypoint.sh /docker-entrypoint.d/99-app-config.sh
RUN chmod +x /docker-entrypoint.d/99-app-config.sh
# Provide a default config.js if none is mounted
COPY frontend/public/config.js /usr/share/nginx/html/config.js
EXPOSE 80
