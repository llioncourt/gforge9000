/**
 * Temporary, reversible production diagnostics for the `/auth` freeze incident.
 *
 * Diagnostic modes are opt-in per request via `?diag=` and ONLY apply to the
 * `/auth` route. Every other route always behaves normally.
 *
 * Supported values: `nopwa`, `noauthroot`, `bare`, `trace`.
 *
 * REMOVE this module (and its call sites in `__root.tsx`) once the incident is
 * closed.
 */

export type DiagMode = "nopwa" | "noauthroot" | "bare" | "trace";

export interface DiagFlags {
  mode: DiagMode | null;
  /** Skip the PwaRegister service-worker / CacheStorage cleanup. */
  skipPwaCleanup: boolean;
  /** Skip the global auth-state listener and its router/query invalidation. */
  skipRootAuthListener: boolean;
  /** Log safe, timestamped lifecycle events to the console. */
  trace: boolean;
}

export const NO_DIAG: DiagFlags = {
  mode: null,
  skipPwaCleanup: false,
  skipRootAuthListener: false,
  trace: false,
};

function isAuthPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, "");
  return clean === "/auth";
}

function parseMode(search: string): DiagMode | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(query).get("diag");
  if (value === "nopwa" || value === "noauthroot" || value === "bare" || value === "trace") {
    return value;
  }
  return null;
}

/** Pure resolver: diagnostics only ever activate on `/auth`. */
export function resolveDiagFlags(pathname: string, search: string): DiagFlags {
  if (!isAuthPath(pathname)) return NO_DIAG;
  const mode = parseMode(search);
  if (!mode) return NO_DIAG;
  return {
    mode,
    skipPwaCleanup: mode === "nopwa" || mode === "bare",
    skipRootAuthListener: mode === "noauthroot" || mode === "bare",
    trace: mode === "trace",
  };
}

/** Reads the current browser location; returns no-diag during SSR. */
export function readDiagFlags(): DiagFlags {
  if (typeof window === "undefined") return NO_DIAG;
  try {
    return resolveDiagFlags(window.location.pathname, window.location.search);
  } catch {
    return NO_DIAG;
  }
}

/** Console-only trace. Never pass tokens, emails, ids or session contents. */
export function diagTrace(enabled: boolean, event: string): void {
  if (!enabled) return;
  console.info(`[diag ${Math.round(performance.now())}ms] ${event}`);
}
