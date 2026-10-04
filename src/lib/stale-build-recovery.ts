/**
 * Recovery from a stale build.
 *
 * After a new version is published, a tab that is still running the previous
 * one asks for code files that no longer exist. Without handling, the screen
 * it was about to open never appears. Vite reports that as a
 * `vite:preloadError` event; one reload brings the tab onto the new version.
 *
 * The reload is rate-limited so a genuinely missing file (or being offline)
 * can never turn into a reload loop.
 */

export const STALE_BUILD_RELOAD_KEY = "ucf.stale-build.reloaded-at";

/** At most one automatic reload inside this window. */
export const STALE_BUILD_RELOAD_WINDOW_MS = 60_000;

export interface ReloadGuardStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Pure decision + bookkeeping: true when an automatic reload is allowed now. */
export function claimStaleBuildReload(storage: ReloadGuardStorage | null, now: number): boolean {
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(STALE_BUILD_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < STALE_BUILD_RELOAD_WINDOW_MS) {
      return false;
    }
    storage.setItem(STALE_BUILD_RELOAD_KEY, String(now));
    return true;
  } catch {
    // Without storage there is no way to rule out a loop, so do not reload.
    return false;
  }
}

/** Installs the listener; returns the cleanup. Browser only. */
export function installStaleBuildRecovery(): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onPreloadError = (event: Event) => {
    let storage: ReloadGuardStorage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    if (!claimStaleBuildReload(storage, Date.now())) return;
    // Handled here: stop the error from also surfacing as a broken screen.
    event.preventDefault();
    window.location.reload();
  };

  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
