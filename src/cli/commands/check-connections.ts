export async function checkConnections(): Promise<void> {
  let failed = false;

  try {
    const { pool } = await import('../../db/client.js');
    const res = await pool.query('SELECT version()');
    console.log(`✓ Postgres: ${String(res.rows[0]?.version).split(',')[0]}`);
    await pool.end();
  } catch (err) {
    failed = true;
    console.error(`✗ Postgres: ${(err as Error).message}`);
  }

  try {
    const { mongoClient } = await import('../../mongo/client.js');
    await mongoClient.connect();
    const admin = mongoClient.db().admin();
    const info = await admin.serverInfo();
    console.log(`✓ MongoDB: ${info.version}`);
    await mongoClient.close();
  } catch (err) {
    failed = true;
    console.error(`✗ MongoDB: ${(err as Error).message}`);
  }

  try {
    const { createRedis } = await import('../../queue/redis.js');
    const redis = createRedis();
    const pong = await redis.ping();
    console.log(`✓ Redis: ${pong}`);
    redis.disconnect();
  } catch (err) {
    failed = true;
    console.error(`✗ Redis: ${(err as Error).message}`);
  }

  if (failed) process.exit(1);
}
