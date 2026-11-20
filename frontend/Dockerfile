# Build the optional geometry core with the same pinned toolchain used locally.
FROM emscripten/emsdk:3.1.64 AS geometry-wasm
WORKDIR /work
COPY frontend/three-presenter/wasm wasm/
RUN emcmake cmake -S wasm -B wasm/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build wasm/build --target threepresenter-geometry --parallel

# Build stage (Node LTS)
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY frontend/openlime/package.json frontend/openlime/package.json
COPY frontend/three-presenter/package.json frontend/three-presenter/package.json
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
COPY --from=geometry-wasm /work/src/geometry/generated/threepresenter-geometry.js frontend/three-presenter/src/geometry/generated/threepresenter-geometry.js
COPY --from=geometry-wasm /work/src/geometry/generated/threepresenter-geometry.wasm frontend/three-presenter/src/geometry/generated/threepresenter-geometry.wasm
# Build local file: dependencies before the app build so Vite can resolve them.
RUN cd frontend/openlime && npm install && npm run rollup
RUN cd frontend/three-presenter && npm install && npm run build
RUN npm run build --workspace frontend

# Runtime stage: non-root Nginx on Alpine, port 8080 (also runs under OpenShift's random UID)
FROM nginxinc/nginx-unprivileged:alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /app/frontend/dist/ .
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/docker-entrypoint.sh /docker-entrypoint.d/99-app-config.sh
# Provide a default config.js if none is mounted
COPY frontend/public/config.js /usr/share/nginx/html/config.js
# The entrypoint rewrites config.js at startup: writable by the nginx user (Compose)
# and by group 0, which OpenShift's random UID belongs to
USER root
RUN chmod +x /docker-entrypoint.d/99-app-config.sh \
  && chown -R 101:0 /usr/share/nginx/html && chmod -R g+w /usr/share/nginx/html
USER 101
EXPOSE 8080
