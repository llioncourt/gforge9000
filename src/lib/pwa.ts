/** Hosts where a service worker must never run: dev server and Lovable preview/sandbox. */
export function isServiceWorkerAllowed(hostname: string, isDev: boolean): boolean {
  if (isDev) return false;
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".localhost")) return false;
  if (h.startsWith("id-preview") || h.includes("-preview--") || h.includes("preview--")) {
    return false;
  }
  if (h.endsWith("-dev.lovable.app") || h.includes("sandbox")) return false;
  return true;
}
