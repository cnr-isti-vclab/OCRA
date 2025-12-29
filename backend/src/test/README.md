# OCRA Backend Testing Suite

## Overview

This directory contains the comprehensive end-to-end test suite for the OCRA backend application.

**Current Status:**
- ✅ **56 tests** - 100% passing
- ⚡ **~1.3-1.5s** execution time
- 🔄 **Sequential execution** - deterministic and conflict-free
- 🧹 **Automatic cleanup** - databases clean after each run

## Test Architecture

### Single Comprehensive Workflow

The test suite uses a **single sequential workflow** (`comprehensive-workflow.e2e.test.ts`) that simulates a complete user journey through the application:

1. **Phase 1: User Management** (15 tests) - CRUD operations, admin status, session management
2. **Phase 2: Empty State** (1 test) - Verify initial empty state
3. **Phase 3: Project CRUD** (12 tests) - Create, read, update, permissions, validation
4. **Phase 4: Members & Permissions** (9 tests) - Role-based access control
5. **Phase 5: File Operations** (4 tests) - HDT files, existence validation
6. **Phase 6: Audit Logs** (2 tests) - Log retrieval, limits
7. **Phase 7: Cleanup** (13 tests) - Cascade deletion, session cleanup

### Test Authentication

Tests use a **dual authentication approach** for realistic testing:

#### Method 1: X-Test-User-Id Header (Simple bypass)

#### Method 1: X-Test-User-Id Header (Simple bypass)

Fast authentication bypass for quick testing. Enabled only when `NODE_ENV=test`.

```typescript
// Quick authentication with header
const user = await prisma.user.create({ 
  data: { 
    id: 'test-user', 
    sys_admin: true 
  } 
});

await request(app)
  .get('/api/users')
  .set('X-Test-User-Id', user.id)
  .expect(200);
```

#### Method 2: Cookie-Based Sessions (Realistic testing)

Simulates real user authentication flow with session cookies:

```typescript
// 1. Create user
const response1 = await request(app)
  .post('/api/users')
  .send({ id: 'test-user', name: 'Test User' })
  .expect(201);

// 2. Create session
const response2 = await request(app)
  .post('/api/sessions')
  .send({ userId: 'test-user' })
  .expect(201);

const sessionCookie = response2.headers['set-cookie'];

// 3. Use session in subsequent requests
await request(app)
  .get('/api/users')
  .set('Cookie', sessionCookie)
  .expect(200);
```

## File Structure

```
src/test/
├── README.md                           # This file
├── comprehensive-workflow.e2e.test.ts  # Main test suite (56 tests)
├── helpers.ts                          # Test utilities
└── workflow.e2e.test.ts                # DEPRECATED - old 16-test version
```

## Running Tests

**Prerequisites:** Database services must be running (PostgreSQL + MongoDB)

```bash
# Start databases
npm run services:start

# Run comprehensive test suite (from root or backend/)
npm test

# Run with verbose output
npm test -- --reporter=verbose

# Watch mode
npm run test:watch

# UI mode
npm run test:ui
```

## Test Utilities (helpers.ts)

### Database Setup & Cleanup

```typescript
import { setupTestDB, cleanupTestDB, ensurePrisma } from './helpers';

describe('My Test Suite', () => {
  // Setup before all tests
  beforeAll(async () => {
    await setupTestDB();
  });

  // Cleanup after all tests
  afterAll(async () => {
    await cleanupTestDB();
  });
});
```

**What happens during cleanup:**
- ✅ All test data removed from PostgreSQL (`oauth_demo_test`)
- ✅ All test data removed from MongoDB (`ocra_audit_test`)
- ✅ Databases left completely clean
- ✅ Atomic transactions ensure consistency

## Key Features

### Sequential Execution

Tests run sequentially to prevent database conflicts:

```typescript
describe.sequential('Test Suite', () => {
  // Tests run one at a time, in order
  it('test 1', async () => { /* ... */ });
  it('test 2', async () => { /* ... */ });
  it('test 3', async () => { /* ... */ });
});
```

### Test Isolation

Each test phase manages its own resources:
- Creates necessary users, projects, sessions
- Tests specific functionality
- Cleans up phase-specific data
- No dependencies between phases

### Test Data Pattern

```typescript
// 3 test users with different roles
const admin = { id: 'admin-user', sys_admin: true };
const regular = { id: 'regular-user', sys_creator: true };
const viewer = { id: 'viewer-user', sys_viewer: true };

// 3 test projects with different visibility
const publicProject = { name: 'Public Project', isPublic: true };
const privateProject = { name: 'Private Project', isPublic: false };
const sharedProject = { name: 'Shared Project', isPublic: false };
```

## Testing Best Practices

### ✅ DO

```typescript
// Use sequential execution for E2E tests
describe.sequential('Full Workflow', () => {
  // Tests run in predictable order
});

// Create users at test start
it('should create user', async () => {
  const response = await request(app)
    .post('/api/users')
    .send({ id: 'test-user', name: 'Test' })
    .expect(201);
  
  userId = response.body.id; // Save for later use
});

// Use proper HTTP status code assertions
it('should return 404 for non-existent resource', async () => {
  await request(app)
    .get('/api/projects/non-existent-id')
    .set('Cookie', sessionCookie)
    .expect(404);
});

// Verify error order (existence before permissions)
it('should check existence before permissions', async () => {
  // Non-existent project returns 404, not 403
  await request(app)
    .delete('/api/projects/fake-id')
    .set('Cookie', ownerSession)
    .expect(404);
});
```

### ❌ DON'T

```typescript
// Don't run E2E tests in parallel (database conflicts)
describe('Test Suite', () => {  // Missing .sequential
  // Tests may conflict with database operations
});

// Don't assume test order in parallel execution
it('test 2', async () => {
  // Assumes 'test 1' ran first - FRAGILE
  const project = await prisma.project.findFirst();
});

// Don't use magic numbers for IDs
const userId = '12345'; // What user is this?

// Don't skip proper cleanup
afterAll(async () => {
  // Forgot to call cleanupTestDB() - database left dirty
});
```

## Troubleshooting

### Database Connection Errors

```
PrismaClientInitializationError: Can't reach database server
```

**Solution:** Start database services first
```bash
npm run services:start
```

### Test Failures After Code Changes

1. Check if migrations are up to date:
   ```bash
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/oauth_demo_test" npx prisma migrate deploy
   ```

2. Manually clean test databases:
   ```bash
   psql -U postgres -d oauth_demo_test -c "TRUNCATE users, projects, project_members, sessions CASCADE;"
   ```

### Session Cookie Issues

Ensure session creation returns proper `set-cookie` header:
```typescript
const response = await request(app)
  .post('/api/sessions')
  .send({ userId: 'test-user' })
  .expect(201);

const cookies = response.headers['set-cookie'];
expect(cookies).toBeDefined();
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      mongodb:
        image: mongo:7
        ports:
          - 27017:27017
    
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd backend
          npm ci
      
      - name: Setup test database
        run: |
          PGPASSWORD=postgres psql -h localhost -U postgres -c "CREATE DATABASE oauth_demo_test;"
          DATABASE_URL="postgresql://postgres:postgres@localhost:5432/oauth_demo_test" npx prisma migrate deploy
      
      - name: Run tests
        run: npm test
        working-directory: backend
```

## Test Coverage

Current coverage by feature:

- ✅ **User Management:** CRUD, admin status, permissions, validation
- ✅ **Authentication:** Sessions, cookies, unauthorized access
- ✅ **Projects:** CRUD, visibility, ownership, duplicate prevention
- ✅ **Members:** Roles (owner/manager/viewer), permissions, cascade deletion
- ✅ **Files:** HDT metadata, file listings, project validation
- ✅ **Audit Logs:** Log retrieval, pagination limits
- ✅ **Error Handling:** Proper HTTP status codes, validation errors

## Future Enhancements

Potential additions if needed:
- Performance benchmarks
- Load testing scenarios
- Extended audit log testing
- File upload/download testing
- WebSocket connection testing
- Rate limiting tests

## Resources

- **Main Test Guide:** `/backend/TESTING.md`
- **Vitest Configuration:** `/backend/vitest.config.ts`
- **Test Environment:** `/backend/.env.test`
- **Vitest Docs:** https://vitest.dev/
