import { useEffect, useState } from 'react';

/**
 * Vendor logos, fetched once from `/api/logo/:service` and kept in
 * localStorage.
 *
 * Three layers, each covering the one below: a module-level Map so a page
 * rendering the same vendor in a table, a chart legend and a drawer resolves it
 * once; localStorage so a reload costs nothing; and the server's own Mongo
 * cache so a cold browser still does not hit an icon service.
 *
 * `null` is a real cached value — the vendor has no usable logo — and is kept
 * for a shorter time in case one appears later.
 */
const STORAGE_PREFIX = 'invoice-mcp:logo:v1:';
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredLogo {
  /** data URL, or null when the vendor has no logo */
  v: string | null;
  /** epoch ms */
  t: number;
}

/** Resolved values for this page load; also dedupes concurrent mounts. */
const memory = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

function readStored(name: string): StoredLogo | undefined {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_PREFIX + name);
  } catch {
    return undefined; // storage disabled (private mode, blocked cookies)
  }
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as StoredLogo;
    if (typeof parsed.t !== 'number') return undefined;
    const ttl = parsed.v ? HIT_TTL_MS : MISS_TTL_MS;
    if (Date.now() - parsed.t > ttl) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeStored(name: string, value: string | null): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify({ v: value, t: Date.now() }));
  } catch {
    // Quota is the likely cause. Drop our own keys and let the next load
    // refill; failing to cache is not worth failing to render over.
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
      }
    } catch {
      // storage is unusable — fall through, the memory cache still works
    }
  }
}

async function fetchLogo(name: string): Promise<string | null> {
  const res = await fetch(`/api/logo/${encodeURIComponent(name)}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { data_url?: string | null };
  return payload.data_url ?? null;
}

function resolveLogo(name: string): Promise<string | null> {
  const pending = inFlight.get(name);
  if (pending) return pending;

  const promise = fetchLogo(name)
    .catch(() => null) // a failed lookup is a missing logo, not a broken page
    .then((value) => {
      memory.set(name, value);
      writeStored(name, value);
      inFlight.delete(name);
      return value;
    });
  inFlight.set(name, promise);
  return promise;
}

/**
 * Drops every cached answer for one vendor, across all three layers.
 *
 * Called after a logo is uploaded or cleared. Without it the change appears not
 * to have taken: the old data URL survives in memory and localStorage for a
 * month, and — worse for the common case — a cached `null` means a vendor that
 * had no logo before the upload keeps rendering its monogram, which reads as
 * the upload having been rejected.
 *
 * The counter increments so mounted components re-run their effect; the value
 * itself is never read.
 */
export function forgetServiceLogo(name: string): void {
  memory.delete(name);
  inFlight.delete(name);
  try {
    localStorage.removeItem(STORAGE_PREFIX + name);
  } catch {
    // storage unusable — clearing the memory layer is enough to refetch
  }
  generation += 1;
  for (const listener of listeners) listener();
}

/**
 * Bumped by `forgetServiceLogo` so every mounted `useServiceLogo` refetches.
 *
 * A module-level subscription rather than a React context because ServiceLogo
 * renders in dozens of places, several of them outside any provider this file
 * could reach, and the cache it reads is module-level too.
 */
let generation = 0;
const listeners = new Set<() => void>();

/**
 * The vendor's logo as a data URL, `null` once it is known there is none, and
 * `undefined` while the lookup is still open — so a caller can hold the frame
 * empty rather than flashing a monogram it is about to replace.
 */
export function useServiceLogo(name: string, enabled: boolean): string | null | undefined {
  /*
   * Tracks `generation` so an upload anywhere re-runs the lookup below.
   * Re-rendering alone would not: the fetching effect keys on [name, enabled],
   * neither of which changes when a logo is replaced, so it would keep the
   * value it already resolved.
   */
  const [generationSeen, setGenerationSeen] = useState(generation);
  useEffect(() => {
    const listener = () => setGenerationSeen(generation);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const [logo, setLogo] = useState<string | null | undefined>(() => {
    if (!enabled) return null;
    if (memory.has(name)) return memory.get(name);
    const stored = readStored(name);
    if (stored) {
      memory.set(name, stored.v);
      return stored.v;
    }
    return undefined;
  });

  useEffect(() => {
    if (!enabled) {
      setLogo(null);
      return;
    }

    if (memory.has(name)) {
      setLogo(memory.get(name));
      return;
    }
    const stored = readStored(name);
    if (stored) {
      memory.set(name, stored.v);
      setLogo(stored.v);
      return;
    }

    let active = true;
    setLogo(undefined);
    resolveLogo(name).then((value) => {
      if (active) setLogo(value);
    });
    return () => {
      active = false;
    };
  }, [name, enabled, generationSeen]);

  return logo;
}
