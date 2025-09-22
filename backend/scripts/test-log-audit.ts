import { logAuditEvent } from '../db.js';
import { connect } from '../src/services/audit.service.js';

async function run() {
  const testSub = `test-log-${Date.now()}`;
  console.log('Writing audit event for', testSub);
  await logAuditEvent({ userSub: testSub, action: 'test.event', success: true, payload: { foo: 'bar' } });
  // wait briefly for async writes
  await new Promise(res => setTimeout(res, 500));
  const { col, client } = await connect();
  const doc = await col.findOne({ userSub: testSub, action: 'test.event' });
  if (!doc) {
    console.error('Test failed: audit document not found');
    process.exitCode = 2;
  } else {
    console.log('Found audit doc:', { eventId: doc.eventId, userSub: doc.userSub, ts: doc.ts });
  }
  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
