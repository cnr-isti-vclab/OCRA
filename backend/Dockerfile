## Backend service Dockerfile
FROM node:18-alpine

# Work in the backend package folder
WORKDIR /app/backend

# Copy only package.json for efficient layer caching (avoid stale lockfile pinning old Prisma)
COPY backend/package.json ./

# Install dependencies (include devDeps to run Prisma CLI during build)
RUN npm install

# Copy Prisma schema into a stable path
COPY prisma /app/prisma

# Generate Prisma Client for the container platform, using the backend's Prisma version
RUN npx prisma generate --schema=/app/prisma/schema.prisma

# Now copy the backend source code
COPY backend/ .

# Expose port
EXPOSE 3002

# Start the server
CMD ["node", "server.js"]
