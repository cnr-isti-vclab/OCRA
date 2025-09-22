import { logAuditEvent } from '../db.js';
import { connect } from '../src/services/audit.service.js';

async function run() {
  try {
    const testUserSub = `test-${Date.now()}`;
  console.log('Calling logAuditEvent for', testUserSub);
  await logAuditEvent({ userSub: testUserSub, eventType: 'login', type: 'login', success: true, userAgent: 'test-agent', ip: '127.0.0.1', payload: { sessionId: 'sess-test' } });
  console.log('logAuditEvent returned; waiting briefly then checking Mongo');
  await new Promise(res => setTimeout(res, 500));
  const { col, client } = await connect();
    const docs = await col.find({ userSub: testUserSub }).toArray();
    console.log('Found docs:', docs.map(d => ({ eventId: d.eventId, userSub: d.userSub, ts: d.ts })));
    await client.close();
  } catch (err) {
    console.error('Test failed:', err);
  }
}

run().catch(err => console.error(err));
