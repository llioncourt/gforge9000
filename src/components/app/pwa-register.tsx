import { useEffect } from "react";

/**
 * TEMPORARY — PRODUCTION INCIDENT ISOLATION.
 *
 * Service-worker registration is intentionally disabled everywhere (localhost,
 * preview and production) so that PWA/CacheStorage state can be ruled out as a
 * cause of the published routing failure. This component now only performs a
 * one-time, idempotent cleanup: it unregisters every service worker for this
 * origin and deletes every CacheStorage entry.
 *
 * It never reloads the page, never loops, and never touches localStorage,
 * sessionStorage, cookies, auth or any backend data.
 *
 * REVERT after diagnosis: restore the `isServiceWorkerAllowed` guarded
 * registration of `/sw.js` (see `@/lib/pwa`, which is kept for that purpose).
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
