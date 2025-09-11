# Project Structure

This project has been reorganized with a clear separation between frontend and backend code:

```
OCRA_min/
├── frontend/                 # React frontend application
│   ├── src/                 # Frontend source code
│   │   ├── routes/          # Page components
│   │   ├── App.tsx          # Main App component
│   │   ├── oauth-backend.ts # OAuth client logic
│   │   └── ...
│   ├── public/              # Static assets
│   ├── package.json         # Frontend dependencies
│   ├── vite.config.ts       # Vite configuration
│   └── tsconfig.json        # TypeScript configuration
├── backend/                 # Node.js backend API
│   ├── src/                 # Backend source code (planned)
│   ├── prisma/              # Database schema and migrations
│   ├── server.js            # Express server
│   ├── db.js               # Database operations
│   └── package.json         # Backend dependencies
├── docker/                  # Docker configuration files
├── keycloak/               # Keycloak realm exports
├── prisma/                 # Shared Prisma schema
├── docker-compose.yml       # Container orchestration
├── Dockerfile              # Frontend container build
└── package.json            # Root workspace configuration
```

## Development Commands

From the root directory, you can use these commands:

```bash
# Start all services (recommended)
npm run dev

# Start frontend development server locally
npm run dev:frontend

# Start backend development server locally
npm run dev:backend

# Build frontend for production
npm run build

# Install all dependencies
npm run install

# Database operations
npm run db:migrate
npm run db:generate
npm run db:studio

# Docker operations
npm run clean         # Stop all containers
npm run logs          # View all logs
npm run logs:backend  # View backend logs only
```

## Next Steps for Further Organization

The frontend can be further organized into:
- `src/components/` - Reusable UI components
- `src/hooks/` - Custom React hooks
- `src/services/` - API client and authentication services
- `src/utils/` - Utility functions
- `src/types/` - TypeScript type definitions

The backend can be organized into:
- `src/controllers/` - Route handlers
- `src/services/` - Business logic
- `src/middleware/` - Express middleware
- `src/utils/` - Utility functions
