# syntax=docker/dockerfile:1
FROM node:22-slim

WORKDIR /app

# Deps for Prisma / OpenSSL / robust ZIP extraction
RUN apt-get update -y && apt-get install -y openssl ca-certificates unzip && rm -rf /var/lib/apt/lists/*

# 1) Copy workspace manifests (better layer caching)
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json

# 2) Install dependencies from the workspace root
RUN npm ci

# 3) Copy sources
COPY backend ./backend
COPY shared ./shared
COPY media ./media

# 4) Build backend + generate Prisma client using the ROOT schema
WORKDIR /app/backend

# Schema in backend/prisma/schema.prisma
RUN npx prisma@5.18.0 generate --schema=./prisma/schema.prisma

# Compile TypeScript (produces /app/backend/dist/* including dist/server.js and dist/seed.js)
RUN npm run build

# 5) Runtime
RUN chmod +x start.sh
EXPOSE 3002
CMD ["sh", "./start.sh"]
