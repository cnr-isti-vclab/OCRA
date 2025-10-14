# Build stage (Node LTS)
FROM node:22-alpine AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* frontend/pnpm-lock.yaml* frontend/yarn.lock* ./

# Install dependencies (including bootstrap)
RUN npm ci || npm install
RUN npm install bootstrap

# Copy shared types (needed for scene-types and scene-migration)
COPY shared/ ../shared/

# Copy frontend source and build
COPY frontend/ .
RUN npm run build

# Runtime stage (latest Nginx on Alpine)
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist/ .
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/docker-entrypoint.sh /docker-entrypoint.d/99-app-config.sh
RUN chmod +x /docker-entrypoint.d/99-app-config.sh
# Provide a default config.js if none is mounted
COPY frontend/public/config.js /usr/share/nginx/html/config.js
EXPOSE 80
