import { db, pool } from '../../db/client.js';

export async function seedOrg(name: string): Promise<void> {
  const existing = await db
    .selectFrom('client.org')
    .selectAll()
    .where('name', '=', name)
    .executeTakeFirst();
  if (existing) {
    console.log(`org already exists: id=${existing.id} name=${existing.name}`);
  } else {
    const row = await db
      .insertInto('client.org')
      .values({ name })
      .returningAll()
      .executeTakeFirstOrThrow();
    console.log(`created org: id=${row.id} name=${row.name}`);
  }
  await pool.end();
}
