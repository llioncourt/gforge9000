/* TOMBSTONE SERVICE WORKER — this release ships no caching/push behavior.
   INCIDENT CONTEXT: a previous production release registered a full
   caching service worker on the live domain; a stale cached routing/asset
   shell caused broken navigation/blank pages after deploys until users
   manually cleared CacheStorage. This file intentionally has NO fetch
   handler, NO push/notificationclick handlers, and NO cache reads.

   It is the single OWNER of obsolete-cache cleanup: it deletes only caches
   created by the obsolete worker (the "ucf-" prefix), one at a time, and it
   always claims clients and unregisters itself afterwards — even if a cache
   deletion fails or CacheStorage is unavailable. It never touches caches it
   does not own.

   The full caching + push worker source is preserved for future
   re-enablement at `public/sw-full.js.disabled` (not served, not
   registered). See `src/lib/pwa.ts` (`PWA_ENABLED`),
   `src/lib/sw-retirement.ts` and `src/components/app/pwa-register.tsx`. */

const OBSOLETE_CACHE_PREFIXES = ["ucf-"];

function isObsoleteCacheKey(key) {
  return OBSOLETE_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

async function deleteObsoleteCaches() {
  if (typeof caches === "undefined") return;
  let keys = [];
  try {
    keys = await caches.keys();
  } catch {
    return;
  }
  for (const key of keys) {
    if (!isObsoleteCacheKey(key)) continue;
    try {
      await caches.delete(key);
    } catch {
      // A failed deletion must not block retirement of this worker.
    }
  }
}

async function retire() {
  await deleteObsoleteCaches();
  try {
    await self.clients.claim();
  } catch {
    // Claiming is best effort.
  }
  try {
    await self.registration.unregister();
  } catch {
    // Nothing else to do; the page side also unregisters this script.
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(retire());
});
