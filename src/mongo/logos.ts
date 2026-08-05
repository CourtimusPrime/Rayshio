import { mongoClient, mongoDb } from './client.js';

/**
 * A fetched vendor logo, keyed by domain. `data` is null for a domain that has
 * no usable icon — cached deliberately, so a vendor without a favicon does not
 * cost an outbound request on every page load.
 */
export interface LogoCacheEntry {
  domain: string;
  data: Buffer | null;
  content_type: string | null;
  fetched_at: Date;
}

/** Hits are re-checked monthly; misses retried daily in case a site gains an icon. */
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;

function collection() {
  return mongoDb().collection<LogoCacheEntry>('service_logos');
}

/** Returns the cached entry, or undefined when absent or past its TTL. */
export async function getCachedLogo(domain: string): Promise<LogoCacheEntry | undefined> {
  await mongoClient.connect();
  const entry = await collection().findOne({ domain });
  if (!entry) return undefined;

  const ttl = entry.data ? HIT_TTL_MS : MISS_TTL_MS;
  if (Date.now() - entry.fetched_at.getTime() > ttl) return undefined;
  return entry;
}

export async function putCachedLogo(
  domain: string,
  data: Buffer | null,
  contentType: string | null,
): Promise<void> {
  await mongoClient.connect();
  await collection().updateOne(
    { domain },
    { $set: { domain, data, content_type: contentType, fetched_at: new Date() } },
    { upsert: true },
  );
}
