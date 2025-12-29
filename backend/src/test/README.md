# Test Authentication Guide

## Come Funziona

L'autenticazione nei test usa un header speciale `X-Test-User-Id` che bypassa il normale flusso di autenticazione quando `NODE_ENV=test`.

## Metodi Disponibili

### 1. `authHeader(user)` - Singolo utente

Usa per test semplici dove serve un solo utente autenticato:

```typescript
it('should do something', async () => {
  const user = await createTestUser({ sys_admin: true });
  
  const response = await request(app)
    .get('/api/protected-endpoint')
    .set(authHeader(user))  // ← Aggiunge l'autenticazione
    .expect(200);
});
```

### 2. `createAuthContext(overrides)` - Con setup automatico

Crea automaticamente un utente e restituisce headers pronti:

```typescript
it('should do something', async () => {
  const { user, headers } = await createAuthContext({ 
    sys_admin: true,
    name: 'Admin User'
  });
  
  const response = await request(app)
    .get('/api/protected-endpoint')
    .set(headers)  // ← Headers già pronti
    .expect(200);
    
  // Puoi usare `user` per assertions
  expect(response.body.userId).toBe(user.id);
});
```

### 3. Test senza autenticazione

Per testare che endpoint protetti ritornino 401:

```typescript
it('should require authentication', async () => {
  await request(app)
    .get('/api/protected-endpoint')
    // ← Nessun header, deve fallire
    .expect(401);
});
```

## Esempi Completi

### Test API che richiede admin

```typescript
it('should allow admin to view all users', async () => {
  // Crea admin user
  const admin = await createTestUser({ sys_admin: true });
  
  // Crea utenti normali
  await createTestUser({ name: 'User 1' });
  await createTestUser({ name: 'User 2' });
  
  const response = await request(app)
    .get('/api/users')
    .set(authHeader(admin))
    .expect(200);
  
  expect(response.body).toHaveLength(3);
});
```

### Test con utente normale (non admin)

```typescript
it('should deny non-admin access', async () => {
  const normalUser = await createTestUser({ sys_admin: false });
  
  await request(app)
    .get('/api/admin/settings')
    .set(authHeader(normalUser))
    .expect(403); // Forbidden
});
```

### Test con più utenti

```typescript
it('should isolate user data', async () => {
  const user1 = await createTestUser({ name: 'Alice' });
  const user2 = await createTestUser({ name: 'Bob' });
  
  // User 1 crea un progetto
  const project = await createTestProject(user1.id);
  
  // User 2 non dovrebbe vederlo (se privato)
  const response = await request(app)
    .get(`/api/projects/${project.id}`)
    .set(authHeader(user2))
    .expect(404); // Not found (per user2)
});
```

### Test CRUD completo

```typescript
describe('Project CRUD', () => {
  let authUser: any;
  let authHeaders: any;
  
  beforeEach(async () => {
    // Setup authentication per tutti i test
    const ctx = await createAuthContext({ 
      sys_creator: true,
      name: 'Project Creator' 
    });
    authUser = ctx.user;
    authHeaders = ctx.headers;
  });
  
  it('should create project', async () => {
    const response = await request(app)
      .post('/api/projects')
      .set(authHeaders)
      .send({ name: 'My Project', description: 'Test' })
      .expect(201);
    
    expect(response.body).toHaveProperty('id');
  });
  
  it('should get project', async () => {
    const project = await createTestProject(authUser.id);
    
    const response = await request(app)
      .get(`/api/projects/${project.id}`)
      .set(authHeaders)
      .expect(200);
    
    expect(response.body.name).toBe(project.name);
  });
});
```

## Note Tecniche

- **Sicurezza**: Il bypass funziona SOLO quando `NODE_ENV=test`
- **Performance**: L'header bypassa completamente la validazione della sessione, rendendo i test veloci
- **Database**: Gli utenti devono esistere nel database di test prima di usarli
- **Cleanup**: Il `beforeEach(cleanupTestDB)` rimuove tutti gli utenti tra i test

## Troubleshooting

### Errore 401 nei test

```typescript
// ❌ Sbagliato - manca autenticazione
await request(app).get('/api/users').expect(200);

// ✅ Corretto
const user = await createTestUser();
await request(app)
  .get('/api/users')
  .set(authHeader(user))
  .expect(200);
```

### User non trovato

```typescript
// ❌ Sbagliato - user non nel database
const fakeUser = { id: 'fake-id' };
await request(app).get('/api/users').set(authHeader(fakeUser));

// ✅ Corretto - crea user prima
const user = await createTestUser();
await request(app).get('/api/users').set(authHeader(user));
```

### Foreign key errors

```typescript
// ❌ Sbagliato - cleanup rimuove l'utente
beforeEach(async () => {
  await cleanupTestDB(); // Rimuove tutto
  testUser = await createTestUser(); // Creato dopo cleanup
});

// ✅ Corretto - ricrea dopo ogni cleanup
beforeEach(async () => {
  await cleanupTestDB();
});

it('test', async () => {
  const user = await createTestUser(); // Crea per ogni test
  // ... rest of test
});
```
