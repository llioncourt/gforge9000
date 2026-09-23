/**
 * Retirement of the obsolete Universal Character Forge service worker.
 *
 * The page side is deliberately NON-destructive: it only unregisters our own
 * known worker script(s) and never touches CacheStorage, localStorage,
 * sessionStorage, cookies, or any worker/cache it does not own. Deleting the
 * obsolete caches is the tombstone worker's job (`public/sw.js`), which owns
 * that cleanup sequentially and unregisters itself even when a cache deletion
 * fails.
 */

/** Worker script paths this app ever registered on its own origin. */
export const OBSOLETE_WORKER_PATHS = ["/sw.js"] as const;

/** Cache-name prefixes created by the obsolete worker. */
export const OBSOLETE_CACHE_PREFIXES = ["ucf-"] as const;

export function isObsoleteCacheKey(key: string): boolean {
  return OBSOLETE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isObsoleteWorkerUrl(scriptUrl: string | null | undefined): boolean {
  if (!scriptUrl) return false;
  try {
    const { pathname } = new URL(scriptUrl, "http://localhost");
    return (OBSOLETE_WORKER_PATHS as readonly string[]).includes(pathname);
  } catch {
    return false;
  }
}

export interface RetirableRegistration {
  active?: { scriptURL?: string } | null;
  installing?: { scriptURL?: string } | null;
  waiting?: { scriptURL?: string } | null;
  unregister: () => Promise<boolean>;
}

/**
 * Unregisters only our own obsolete worker registrations, one at a time.
 * Returns how many registrations were unregistered. Never throws.
 */
export async function retireObsoleteWorkers(
  getRegistrations: () => Promise<readonly RetirableRegistration[]>,
): Promise<{ inspected: number; unregistered: number; skipped: number }> {
  let registrations: readonly RetirableRegistration[] = [];
  try {
    registrations = await getRegistrations();
  } catch {
    return { inspected: 0, unregistered: 0, skipped: 0 };
  }

  let unregistered = 0;
  let skipped = 0;
  for (const registration of registrations) {
    const url =
      registration.active?.scriptURL ??
      registration.waiting?.scriptURL ??
      registration.installing?.scriptURL ??
      null;
    if (!isObsoleteWorkerUrl(url)) {
      skipped += 1;
      continue;
    }
    try {
      const ok = await registration.unregister();
      if (ok) unregistered += 1;
    } catch {
      // A failed unregister must not block the remaining registrations.
    }
  }
  return { inspected: registrations.length, unregistered, skipped };
}
