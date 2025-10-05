## Backend service Dockerfile
FROM node:22-alpine

# Work in the backend package folder
WORKDIR /app/backend

# Copy only package.json for efficient layer caching (avoid stale lockfile pinning old Prisma)
COPY backend/package.json backend/package-lock.json* ./

# Install dependencies (include devDeps to run Prisma CLI during build)
RUN npm ci || npm install

# Copy Prisma schema into backend package path so generation targets backend's node_modules
COPY prisma /app/backend/prisma

# Generate Prisma Client for the container platform using backend's schema
RUN npx prisma generate --schema=./prisma/schema.prisma

# Now copy the backend source code
COPY backend/ .

# Copy media files for seeding projects
COPY media /app/media

# Build TypeScript to JavaScript
RUN npm run build

# Make the startup script executable
RUN chmod +x start.sh

# Expose port
EXPOSE 3002

# Start with the startup script that runs migrations first
CMD ["sh", "./start.sh"]
