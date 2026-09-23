/* TOMBSTONE SERVICE WORKER — this release ships no caching/push behavior.
   INCIDENT CONTEXT: a previous production release registered a full
   caching service worker on the live domain; a stale cached routing/asset
   shell caused broken navigation/blank pages after deploys until users
   manually cleared CacheStorage. This file intentionally has NO fetch
   handler, NO push/notificationclick handlers, and NO cache reads. Its only
   job is to immediately take control of any previously-registered worker,
   wipe all CacheStorage entries, and unregister itself so browsers stop
   running any service worker for this origin at all.

   The full caching + push worker source is preserved for future
   re-enablement at `public/sw-full.js.disabled` (not served, not
   registered). See `src/lib/pwa.ts` (`PWA_ENABLED`) and
   `src/components/app/pwa-register.tsx` for the single source of truth
   controlling registration. */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("ucf-") || true).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister()),
  );
});
