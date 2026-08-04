/**
 * Diagnostic: replays discovery's sender attribution over the live mailbox and
 * reports which vendors it would find, flagging those that arrive via a billing
 * alias / Google Group. Useful for auditing discovery coverage after changes to
 * the query or to sender resolution. Read-only.
 *
 *   npx tsx scripts/probe-mailbox.ts [gmail-query]
 */
import { db } from '../src/db/client.js';
import { resolveSender } from '../src/gmail/messages.js';
import { gmailClientForAccount } from '../src/gmail/oauth.js';
import { discoveryQuery, listAllMessages } from '../src/gmail/search.js';

const { gmail } = await gmailClientForAccount(1);

const INVOICEY = /receipt|invoice|payment|paid|billing|statement|subscription|renew|charge/i;
const query = process.argv[2] ?? discoveryQuery();

async function meta(id: string) {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id,
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'X-Original-Sender'],
  });
  const h = res.data.payload?.headers ?? [];
  const get = (n: string) => h.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value ?? null;
  return {
    sender: resolveSender(get('From') ?? '', get('X-Original-Sender')),
    subject: get('Subject') ?? '',
  };
}

/** Bounded-concurrency map — Gmail metadata gets are the bottleneck. */
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

console.log(`query: ${query}`);
const refs = await listAllMessages(gmail, query, 3000);
console.log(`matched messages: ${refs.length}\n`);

const metas = await mapPool(refs, 12, (r) => meta(r.id));

const byAddress = new Map<
  string,
  { name: string | null; all: number; invoicey: number; via: string | null; sample: string }
>();

for (const m of metas) {
  const { address, name, deliveredVia } = m.sender;
  if (!address) continue;
  const e = byAddress.get(address) ?? {
    name,
    all: 0,
    invoicey: 0,
    via: deliveredVia,
    sample: '',
  };
  e.all++;
  e.name ??= name;
  e.via ??= deliveredVia;
  if (INVOICEY.test(m.subject)) {
    e.invoicey++;
    if (!e.sample) e.sample = m.subject;
  }
  byAddress.set(address, e);
}

const known = new Set(
  (await db.selectFrom('server.service').select('sender_address').execute()).map(
    (s) => s.sender_address,
  ),
);

const withInvoices = [...byAddress.entries()]
  .filter(([, e]) => e.invoicey > 0)
  .sort((a, b) => b[1].invoicey - a[1].invoicey);

console.log(`distinct senders: ${byAddress.size}`);
console.log(`  ...sending invoice-like mail: ${withInvoices.length}`);
console.log(`  ...already ingested: ${withInvoices.filter(([a]) => known.has(a)).length}\n`);

console.log(' inv/all  ingested  via-alias  sender');
for (const [address, e] of withInvoices) {
  console.log(
    `${String(e.invoicey).padStart(4)}/${String(e.all).padEnd(4)}  ${known.has(address) ? 'yes' : 'NO '}       ${
      e.via ? 'yes' : 'no '
    }        ${e.name ?? '(no name)'} <${address}>`,
  );
  console.log(`                                 e.g. ${e.sample.slice(0, 80)}`);
}
process.exit(0);
