import { useEffect } from "react";

import { isServiceWorkerAllowed } from "@/lib/pwa";

/**
 * Registers the offline service worker on real deployments only.
 * In dev/preview it unregisters any worker and clears its caches so a stale
 * app shell can never be served there.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const allowed = isServiceWorkerAllowed(window.location.hostname, import.meta.env.DEV);

    if (!allowed) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => void reg.unregister());
      });
      if ("caches" in window) {
        void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
      }
      return;
    }

    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // Pick up a newly published worker instead of keeping the installed one.
          void reg.update();
        })
        .catch(() => {
          /* offline support is optional; ignore registration failures */
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
