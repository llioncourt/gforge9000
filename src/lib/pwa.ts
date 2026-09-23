/**
 * PWA / background-push release flag.
 *
 * INCIDENT CONTEXT: a previous production release shipped with the service
 * worker registered on the live domain. A stale cached routing/asset shell
 * caused users to be served an outdated app shell after deploys (broken
 * routing, blank pages, stuck navigation) until they manually cleared
 * CacheStorage. Registration was disabled everywhere (see `pwa-register.tsx`,
 * which now only unregisters existing workers and clears caches) and this
 * flag is the single source of truth every other module must consult.
 *
 * `public/sw.js` currently ships as a pure TOMBSTONE worker: it has no
 * fetch/push/notificationclick handlers and no cache reads — on
 * install/activate it only clears CacheStorage, claims clients, and
 * unregisters itself. The previous full caching + push worker source is
 * preserved, dormant, at `public/sw-full.js.disabled` (not served, not
 * registered by anything).
 *
 * To re-enable for a future release: flip `PWA_ENABLED` to `true`, restore
 * `public/sw.js` from `public/sw-full.js.disabled`, implement the guarded
 * `navigator.serviceWorker.register("/sw.js")` branch already stubbed in
 * `pwa-register.tsx`, and update `src/rules/__tests__/pwa.test.ts` and
 * `src/lib/push.ts` accordingly.
 */
export const PWA_ENABLED = false;

/** Hosts where a service worker could run once PWA_ENABLED is true again. */
function isServiceWorkerAllowedHost(hostname: string, isDev: boolean): boolean {
  if (isDev) return false;
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost")) return false;
  if (h.startsWith("id-preview") || h.includes("-preview--") || h.includes("preview--")) {
    return false;
  }
  if (h.endsWith("-dev.lovable.app") || h.includes("sandbox")) return false;
  return true;
}

/**
 * True only when both this release's PWA flag is on AND the host would
 * otherwise be eligible. While `PWA_ENABLED` is false (current release) this
 * always returns false, regardless of hostname.
 */
export function isServiceWorkerAllowed(hostname: string, isDev: boolean): boolean {
  if (!PWA_ENABLED) return false;
  return isServiceWorkerAllowedHost(hostname, isDev);
}
