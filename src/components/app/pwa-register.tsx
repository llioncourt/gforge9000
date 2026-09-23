import { useEffect } from "react";

import { PWA_ENABLED } from "@/lib/pwa";
import { retireObsoleteWorkers } from "@/lib/sw-retirement";
import { diagTrace } from "@/lib/diag-modes";

/**
 * PWA registration is disabled for this release — see `PWA_ENABLED` in
 * `@/lib/pwa` for the production incident that caused it (a stale cached
 * routing/asset shell served after deploys).
 *
 * While `PWA_ENABLED` is false, this component performs ONE narrow action:
 * it unregisters our own obsolete worker script (`/sw.js`), sequentially and
 * best-effort. It never deletes CacheStorage entries (the tombstone worker
 * owns that, for its own caches only), never touches workers or caches it
 * does not own, never reloads the page, and never touches localStorage,
 * sessionStorage, cookies, auth or any backend data.
 *
 * It is not mounted on the public `/auth` route at all — opening the sign-in
 * page performs no worker or cache mutation whatsoever.
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
    if (PWA_ENABLED) return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    diagTrace(trace, "sw retirement start");
    void retireObsoleteWorkers(() => navigator.serviceWorker.getRegistrations()).then(() => {
      if (!cancelled) diagTrace(trace, "sw retirement end");
    });

    return () => {
      cancelled = true;
    };

    // TODO(re-enable PWA): guard with `isServiceWorkerAllowed(location.hostname, import.meta.env.DEV)`
    // from `@/lib/pwa` and register `/sw.js` here.
  }, [skipCleanup, trace]);

  return null;
}
