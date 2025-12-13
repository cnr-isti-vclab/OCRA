# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

# 1) Copy workspace manifests (better layer caching)
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

# 2) Install dependencies from the workspace root
RUN npm ci

# 3) Copy sources
COPY backend ./backend
COPY media ./media
COPY prisma ./prisma

# 4) Build backend + generate Prisma client using the ROOT schema
WORKDIR /app/backend

# Use absolute path to avoid accidentally picking a workspace-local prisma folder
RUN npx prisma generate --schema=/app/prisma/schema.prisma

# Compile TypeScript (produces /app/backend/dist/* including dist/server.js and dist/seed.js)
RUN npm run build

# 5) Runtime
RUN chmod +x start.sh
EXPOSE 3002
CMD ["sh", "./start.sh"]
