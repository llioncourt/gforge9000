import { useEffect } from "react";

/**
 * PWA registration is disabled for this release — see `PWA_ENABLED` in
 * `@/lib/pwa` for the production incident that caused it (a stale cached
 * routing/asset shell served after deploys). This component now only
 * performs a one-time, idempotent cleanup: it unregisters every service
 * worker for this origin and deletes every CacheStorage entry.
 *
 * It never reloads the page, never loops, and never touches localStorage,
 * sessionStorage, cookies, auth or any backend data.
 *
 * TO RE-ENABLE later: flip `PWA_ENABLED` to `true` in `@/lib/pwa`, then
 * restore an `isServiceWorkerAllowed`-guarded registration of `/sw.js` here.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister().catch(() => false))))
        .catch(() => undefined);
    }

    if ("caches" in window) {
      void caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key).catch(() => false))))
        .catch(() => undefined);
    }
  }, []);

  return null;
}
