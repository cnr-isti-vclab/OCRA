## Backend service Dockerfile
FROM node:22-alpine

# Work in the backend package folder
WORKDIR /app/backend

# Copy Prisma schema into backend package path (needed before package install for dependencies)
COPY prisma /app/backend/prisma

# Copy the backend source code (includes package.json, package-lock.json, and all source files)
COPY backend/ .

# Copy media files for seeding projects
COPY media /app/media

# Install dependencies (include devDeps to run Prisma CLI during build)
RUN npm ci || npm install

# Generate Prisma Client for the container platform using backend's schema
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build TypeScript to JavaScript
RUN npm run build

# Make the startup script executable
RUN chmod +x start.sh

# Expose port
EXPOSE 3002

# Start with the startup script that runs migrations first
CMD ["sh", "./start.sh"]
