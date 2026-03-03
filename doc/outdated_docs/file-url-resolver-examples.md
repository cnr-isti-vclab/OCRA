# File URL Resolver Examples

This document shows how to use different file URL resolvers with ThreePresenter.

## Default Behavior (OCRA API)

By default, ThreePresenter uses the `OcraFileUrlResolver` which resolves files through OCRA's backend API:

```typescript
import { ThreePresenter } from './components/ThreePresenter';

// Uses OcraFileUrlResolver by default
const presenter = new ThreePresenter(mountElement);

// Loads model from: http://localhost:3000/api/projects/123/files/model.glb
await presenter.loadScene({
  projectId: '123',
  models: [{ id: 'model1', file: 'model.glb' }]
});
```

## Custom Resolvers

### 1. Static Base URL (CDN/Static Hosting)

Load models from a CDN or static file server:

```typescript
import { ThreePresenter } from './components/ThreePresenter';
import { StaticBaseUrlResolver } from './components/three-presenter';

const resolver = new StaticBaseUrlResolver('https://cdn.example.com/models');

const presenter = new ThreePresenter(mountElement, resolver);

// Loads model from: https://cdn.example.com/models/scene.glb
await presenter.loadScene({
  models: [{ id: 'model1', file: 'scene.glb' }]
});
```

### 2. Local Development (Relative Paths)

Load models from your development server:

```typescript
import { ThreePresenter } from './components/ThreePresenter';
import { DefaultFileUrlResolver } from './components/three-presenter';

const resolver = new DefaultFileUrlResolver();

const presenter = new ThreePresenter(mountElement, resolver);

// Loads model from: /public/models/scene.glb (relative to page)
await presenter.loadScene({
  models: [{ id: 'model1', file: '/public/models/scene.glb' }]
});
```

### 3. Custom Resolution Logic

Implement complex URL resolution logic:

```typescript
import { ThreePresenter } from './components/ThreePresenter';
import { FunctionResolver } from './components/three-presenter';

const resolver = new FunctionResolver((filePath, context) => {
  // Already absolute URL? Return as-is
  if (filePath.startsWith('http')) {
    return filePath;
  }
  
  // Different logic based on file type
  if (filePath.endsWith('.glb') || filePath.endsWith('.gltf')) {
    return `https://3d-assets.example.com/${context.projectId}/${filePath}`;
  }
  
  if (filePath.endsWith('.ply')) {
    return `https://scans.example.com/${filePath}`;
  }
  
  // Default
  return `/assets/${filePath}`;
});

const presenter = new ThreePresenter(mountElement, resolver);
```

### 4. Environment-Aware Resolver

Different URLs for dev/staging/production:

```typescript
import { FunctionResolver } from './components/three-presenter';

function createEnvironmentResolver() {
  const env = import.meta.env.MODE; // 'development', 'staging', 'production'
  
  const baseUrls = {
    development: 'http://localhost:3000',
    staging: 'https://staging-api.example.com',
    production: 'https://api.example.com'
  };
  
  return new FunctionResolver((filePath, context) => {
    if (filePath.startsWith('http')) return filePath;
    
    const base = baseUrls[env] || baseUrls.development;
    return `${base}/api/projects/${context.projectId}/files/${filePath}`;
  });
}

const presenter = new ThreePresenter(
  mountElement,
  createEnvironmentResolver()
);
```

### 5. Authenticated Resolver

Add authentication tokens to file requests:

```typescript
import { FunctionResolver } from './components/three-presenter';

function createAuthenticatedResolver(getToken: () => string) {
  return new FunctionResolver((filePath, context) => {
    if (filePath.startsWith('http')) return filePath;
    
    const token = getToken();
    const base = 'https://api.example.com';
    const url = `${base}/api/projects/${context.projectId}/files/${filePath}`;
    
    // Note: Token would typically be added as a header in a custom loader
    // This is just for illustration
    return `${url}?token=${token}`;
  });
}

const presenter = new ThreePresenter(
  mountElement,
  createAuthenticatedResolver(() => localStorage.getItem('auth_token'))
);
```

### 6. Multi-Source Resolver

Try multiple sources with fallback:

```typescript
import { FunctionResolver } from './components/three-presenter';

const resolver = new FunctionResolver((filePath, context) => {
  if (filePath.startsWith('http')) return filePath;
  
  // Try CDN first, fallback to API
  const cdn = `https://cdn.example.com/cache/${context.projectId}/${filePath}`;
  const api = `https://api.example.com/projects/${context.projectId}/files/${filePath}`;
  
  // In practice, you'd implement retry logic in the loader
  // This just demonstrates the concept
  return cdn; // Could check availability and fallback to api
});
```

## Implementing a Custom Resolver

Create your own resolver by implementing the `FileUrlResolver` interface:

```typescript
import type { FileUrlResolver, FileResolverContext } from './components/three-presenter';

class MyCustomResolver implements FileUrlResolver {
  constructor(private config: MyConfig) {}
  
  resolve(filePath: string, context: FileResolverContext): string {
    // Your custom logic here
    
    // Example: Use different servers for different file types
    const ext = filePath.split('.').pop()?.toLowerCase();
    
    if (ext === 'glb' || ext === 'gltf') {
      return `${this.config.modelServer}/${filePath}`;
    }
    
    if (ext === 'ply') {
      return `${this.config.scanServer}/${filePath}`;
    }
    
    return filePath;
  }
}

// Use it
const resolver = new MyCustomResolver({
  modelServer: 'https://models.example.com',
  scanServer: 'https://scans.example.com'
});

const presenter = new ThreePresenter(mountElement, resolver);
```

## Testing with Different Resolvers

You can easily test with different resolvers:

```typescript
import { describe, it, expect } from 'vitest';
import { ThreePresenter } from './components/ThreePresenter';
import { FunctionResolver } from './components/three-presenter';

describe('ThreePresenter with custom resolver', () => {
  it('should use custom URL resolver', async () => {
    const mockMount = document.createElement('div');
    
    // Track resolved URLs
    const resolvedUrls: string[] = [];
    
    const resolver = new FunctionResolver((filePath, context) => {
      const url = `https://test.example.com/${filePath}`;
      resolvedUrls.push(url);
      return url;
    });
    
    const presenter = new ThreePresenter(mockMount, resolver);
    
    // Test would load scene and verify URLs
    // expect(resolvedUrls).toContain('https://test.example.com/model.glb');
  });
});
```

## Migration from getApiBase()

**Before (tightly coupled to OCRA):**
```typescript
// In ThreePresenter.ts
import { getApiBase } from '../config/oauth';

// Hardcoded URL construction
const url = `${getApiBase()}/api/projects/${projectId}/files/${file}`;
```

**After (decoupled and flexible):**
```typescript
// In ThreePresenter.ts
import type { FileUrlResolver } from './three-presenter/types/FileUrlResolver';

// Injected resolver
const url = this.fileUrlResolver.resolve(file, { projectId });
```

**Benefits:**
- ✅ ThreePresenter is independent of OCRA configuration
- ✅ Easy to test with mock resolvers
- ✅ Flexible file loading strategies
- ✅ Can be reused in other projects
- ✅ No breaking changes to existing code

## Summary

The FileUrlResolver pattern provides:

1. **Flexibility** - Different URL strategies for different environments
2. **Testability** - Easy to mock in tests
3. **Reusability** - ThreePresenter works in any project
4. **Independence** - No coupling to OCRA configuration
5. **Backward Compatibility** - Existing code continues to work

Choose the resolver that fits your use case, or implement a custom one!
