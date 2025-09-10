# Backend service Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY backend/package*.json ./backend/
COPY prisma/ ./prisma/

# Install dependencies in backend directory  
WORKDIR /app/backend
RUN npm install

# Copy backend source files (but preserve node_modules)
COPY backend/server.js ./server.js
COPY backend/db.js ./db.js

# Copy prisma files to app root for generation
WORKDIR /app
COPY prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3002

# Start the server from backend directory
WORKDIR /app/backend
CMD ["node", "server.js"]
