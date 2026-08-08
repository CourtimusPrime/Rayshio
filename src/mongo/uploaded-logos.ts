import { mongoClient, mongoDb } from './client.js';

/**
 * Logos an org uploaded for a vendor, as opposed to the favicons cached in
 * `service_logos`.
 *
 * A separate collection because the two have opposite lifetimes: the favicon
 * cache is disposable and TTL'd, and dropping it costs one refetch. These are
 * user data — the only copy of a file somebody chose — and must never be
 * evicted by a cache policy written for the other kind.
 */
export interface UploadedLogo {
  /** UUID, mirrored in `client.service_override.logo_id`. */
  logo_id: string;
  svg: Buffer;
  uploaded_at: Date;
}

/**
 * Vector marks are small. 64 KB is generous for a real logo and small enough
 * that a hostile upload cannot be used to fill the collection — and the file is
 * inlined into a JSON response as base64, which inflates it by a third.
 */
export const MAX_LOGO_BYTES = 64 * 1024;

function collection() {
  return mongoDb().collection<UploadedLogo>('uploaded_logos');
}

/**
 * Whether these bytes are an SVG this app is willing to serve.
 *
 * Rejects rather than sanitises. Stripping scripts out of SVG with string
 * surgery is a well-worn way to ship a filter that a nested CDATA section or an
 * unusual entity encoding walks straight through; refusing the file is the only
 * version of this that is honestly correct. A vendor logo has no business
 * carrying script in the first place, so nothing legitimate is lost.
 *
 * This is defence in depth, not the primary control. The primary control is
 * that these are rendered through `<img src="data:image/svg+xml;...">` in
 * ServiceLogo, and browsers do not run script in an image context — which is
 * also why an uploaded logo must never be routed to that component's
 * `dangerouslySetInnerHTML` tier.
 */
export function svgRejectionReason(data: Buffer): string | undefined {
  if (data.byteLength === 0) return 'the file is empty';
  if (data.byteLength > MAX_LOGO_BYTES) {
    return `the file is larger than ${Math.floor(MAX_LOGO_BYTES / 1024)}kb`;
  }

  const text = data.toString('utf8');
  // A leading XML declaration, comments or a doctype may precede the root.
  if (!/<svg[\s>]/i.test(text)) return 'that file is not an SVG';

  if (/<script[\s>]/i.test(text)) return 'the SVG contains a script and was not accepted';
  if (/\son\w+\s*=/i.test(text)) {
    return 'the SVG contains an event handler and was not accepted';
  }
  if (/(javascript|data)\s*:/i.test(text)) {
    return 'the SVG contains an embedded URL and was not accepted';
  }
  if (/<foreignObject[\s>]/i.test(text)) {
    return 'the SVG embeds foreign content and was not accepted';
  }
  return undefined;
}

export async function putUploadedLogo(logoId: string, svg: Buffer): Promise<void> {
  await mongoClient.connect();
  await collection().updateOne(
    { logo_id: logoId },
    { $set: { logo_id: logoId, svg, uploaded_at: new Date() } },
    { upsert: true },
  );
}

/**
 * Reads the stored bytes back as a Buffer.
 *
 * A Node Buffer written into Mongo does not come back as one: the driver
 * returns a BSON `Binary`, whose bytes live under `.buffer`. `Buffer.from()` on
 * the wrapper itself does not throw — it produces an *empty* buffer, so the
 * failure is silent all the way to the browser, where the only symptom is a
 * broken-image icon. Worse, an empty payload still base64-encodes into a
 * perfectly well-formed `data:image/svg+xml;base64,` URL, so a test asserting
 * on the prefix passes while nothing renders. Assert on byte length.
 */
export async function getUploadedLogo(logoId: string): Promise<Buffer | undefined> {
  await mongoClient.connect();
  const row = await collection().findOne({ logo_id: logoId });
  const raw = row?.svg as unknown;
  if (!raw) return undefined;

  if (Buffer.isBuffer(raw)) return raw;
  // BSON Binary — the bytes are one level down
  const inner = (raw as { buffer?: Uint8Array }).buffer;
  if (inner) return Buffer.from(inner);
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  return undefined;
}

/**
 * Forgiving about a miss, like `deletePdf`: the caller is clearing the Postgres
 * pointer, and a blob that has already gone must not block that.
 */
export async function deleteUploadedLogo(logoId: string): Promise<void> {
  await mongoClient.connect();
  await collection().deleteOne({ logo_id: logoId });
}
