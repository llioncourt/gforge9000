/**
 * Short-lived reuse of signed image addresses.
 *
 * Every private image is shown through a signed address that has to be
 * requested first. Asking again for each screen cost one request per image
 * and, because each answer is a different address, also made the browser
 * download the same picture again instead of using its own cache.
 *
 * An address is reused for a few minutes (far less than its real validity),
 * identical requests in flight share one call, and failures are never kept.
 * The cache lives in memory only and is emptied on sign-out.
 */

/** How long an address is reused. Signed addresses themselves last hours. */
export const SIGNED_URL_REUSE_MS = 15 * 60 * 1000;

/** Upper bound on remembered addresses, so a long session cannot grow forever. */
const MAX_ENTRIES = 2000;

type Entry = { url: string; expiresAt: number };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<string | null>>();

function keyOf(bucket: string, path: string): string {
  return `${bucket}\n${path}`;
}

/**
 * Returns a reusable signed address for `bucket`/`path`, calling `sign` only
 * when none is fresh. `sign` keeps each caller's own error behaviour: whatever
 * it throws is rethrown, and a `null` result is returned as-is and not kept.
 */
export async function cachedSignedUrl(
  bucket: string,
  path: string,
  sign: () => Promise<string | null>,
  now: () => number = Date.now,
): Promise<string | null> {
  const key = keyOf(bucket, path);

  const hit = cache.get(key);
  if (hit && hit.expiresAt > now()) return hit.url;
  if (hit) cache.delete(key);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const url = await sign();
      if (url) {
        if (cache.size >= MAX_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(key, { url, expiresAt: now() + SIGNED_URL_REUSE_MS });
      }
      return url;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

/** Forgets every remembered address (called on sign-out). */
export function clearSignedUrlCache(): void {
  cache.clear();
  inFlight.clear();
}
