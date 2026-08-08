export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // non-JSON error body — keep the status text
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const qs = query.toString();
  return request<T>('GET', `/api${path}${qs ? `?${qs}` : ''}`);
}

export function apiSend<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  return request<T>(method, `/api${path}`, body);
}

export interface UploadResponse {
  invoice_id: number;
  filename: string;
  /** True when the org already had this exact file — nothing was written. */
  duplicate: boolean;
}

/**
 * Posts one file as a raw body, which is what `/invoices/upload` expects.
 *
 * Not FormData: the server takes a single PDF per request so that one corrupt
 * file fails on its own rather than taking a batch with it, and so a multipart
 * parser is not needed on either side. The filename travels in the query string
 * because the body is the file itself.
 *
 * A duplicate comes back 200 rather than 202 and is a success, not an error —
 * the caller reads `duplicate` to tell the two apart. Only a 4xx/5xx throws.
 */
export async function apiUploadPdf(file: File): Promise<UploadResponse> {
  const res = await fetch(`/api/invoices/upload?filename=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/pdf' },
    body: file,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // non-JSON error body — keep the status text
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as UploadResponse;
}
