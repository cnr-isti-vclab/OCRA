import { getAllUsersWithStats } from '../src/controllers/users.controller.js';

// Minimal mock Request/Response objects
class MockRes {
  statusCode = 200;
  body: any = null;
  status(code: number) { this.statusCode = code; return this; }
  json(obj: any) { this.body = obj; }
}

async function run() {
  const req: any = { headers: {}, cookies: {}, query: {} };
  const res = new MockRes();
  try {
    await getAllUsersWithStats(req, res as any);
    if (!res.body) {
      console.error('Test failed: no response body');
      process.exitCode = 2;
      return;
    }
    console.log('getAllUsersWithStats response sample:');
    console.log(Array.isArray(res.body) ? res.body.slice(0,3) : res.body);
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  }
}

run();
