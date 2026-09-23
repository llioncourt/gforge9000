import { useEffect } from "react";

import { PWA_ENABLED } from "@/lib/pwa";
import { diagTrace } from "@/lib/diag-modes";

/**
 * PWA registration is disabled for this release — see `PWA_ENABLED` in
 * `@/lib/pwa` for the production incident that caused it (a stale cached
 * routing/asset shell served after deploys). This component consults
 * `PWA_ENABLED` as the single source of truth:
 *
 * - While `PWA_ENABLED` is false (current release), it performs a one-time,
 *   idempotent cleanup: unregisters every service worker for this origin and
 *   deletes every CacheStorage entry.
 * - It never force-unregisters/clears caches when `PWA_ENABLED` is true, so
 *   a future re-enabled worker isn't immediately torn down by this
 *   component.
 *
 * It never reloads the page, never loops, and never touches localStorage,
 * sessionStorage, cookies, auth or any backend data.
 *
 * TO RE-ENABLE later: flip `PWA_ENABLED` to `true` in `@/lib/pwa`, restore
 * `public/sw.js` from `public/sw-full.js.disabled`, and implement the
 * `isServiceWorkerAllowed`-guarded registration branch below.
 */
export function PwaRegister({
  skipCleanup = false,
  trace = false,
}: {
  /** Temporary `/auth` freeze diagnostics — see `@/lib/diag-modes`. */
  skipCleanup?: boolean;
  trace?: boolean;
} = {}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipCleanup) return;

    if (!PWA_ENABLED) {
      diagTrace(trace, "pwa cleanup start");
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
      diagTrace(trace, "pwa cleanup end");
      return;
    }

    // TODO(re-enable PWA): guard with `isServiceWorkerAllowed(location.hostname, import.meta.env.DEV)`
    // from `@/lib/pwa` and register `/sw.js` here, e.g.:
    //   if ("serviceWorker" in navigator && isServiceWorkerAllowed(location.hostname, import.meta.env.DEV)) {
    //     void navigator.serviceWorker.register("/sw.js");
    //   }
  }, [skipCleanup, trace]);

  return null;
}
