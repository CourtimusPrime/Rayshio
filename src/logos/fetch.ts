import { getCachedLogo, putCachedLogo } from '../mongo/logos.js';

/**
 * Icon sources, tried in order. Both are fetched by this server, never by the
 * browser — a viewer's browser should not have to tell a third party which
 * vendors the org pays.
 */
const SOURCES = [
  (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  (domain: string) => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
];

/** Google returns a 16px globe placeholder for unknown domains; it is tiny. */
const MIN_BYTES = 100;
const MAX_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;

export interface Logo {
  data: Buffer;
  contentType: string;
}

async function fetchOne(url: string): Promise<Logo | undefined> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal, redirect: 'follow' });
  } catch {
    return undefined;
  }
  if (!res.ok) return undefined;

  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (!contentType.startsWith('image/')) return undefined;

  const data = Buffer.from(await res.arrayBuffer());
  if (data.byteLength < MIN_BYTES || data.byteLength > MAX_BYTES) return undefined;
  return { data, contentType };
}

/**
 * The logo for a domain, from cache when warm. A domain with no usable icon
 * caches as a miss so the outbound calls are not repeated on every request.
 */
export async function logoForDomain(domain: string): Promise<Logo | undefined> {
  const cached = await getCachedLogo(domain);
  if (cached) {
    return cached.data && cached.content_type
      ? { data: cached.data, contentType: cached.content_type }
      : undefined;
  }

  for (const source of SOURCES) {
    const logo = await fetchOne(source(domain));
    if (logo) {
      await putCachedLogo(domain, logo.data, logo.contentType);
      return logo;
    }
  }

  await putCachedLogo(domain, null, null);
  return undefined;
}
