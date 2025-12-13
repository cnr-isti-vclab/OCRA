# syntax=docker/dockerfile:1

########################################
# 1) Build stage (Node + workspaces)
########################################
FROM node:22-alpine AS build

WORKDIR /app

# Copy workspace manifests first (better Docker cache)
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

# Install dependencies from ROOT (npm workspaces)
RUN npm ci

# Copy frontend sources and build
COPY frontend ./frontend
WORKDIR /app/frontend

# Build the static site (Vite -> dist/)
RUN npm run build


########################################
# 2) Runtime stage (Nginx)
########################################
FROM nginx:alpine

# Optional: custom nginx config (uncomment if you have it)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built frontend to Nginx web root
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
