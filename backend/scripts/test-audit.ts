import { connect } from '../src/services/audit.service.js';

async function run() {
  try {
    const { col, client } = await connect();
    const doc = {
      eventId: `test-${Date.now()}`,
      ts: new Date(),
      userSub: 'test-user-sub',
      action: 'login',
      success: true,
      userAgent: 'test-agent',
      payload: { note: 'test-insert' }
    };

    const insert = await col.insertOne(doc);
    console.log('Inserted id:', insert.insertedId.toString());

    const found = await col.find({ userSub: 'test-user-sub' }).sort({ ts: -1 }).limit(5).toArray();
    console.log('Found docs:', found.map((d: any) => ({ eventId: d.eventId, ts: d.ts })));

    await client.close();
  } catch (err) {
    console.error('Test audit script error:', err);
    process.exit(1);
  }
}

run();
