/**
 * Narrowly-scoped, opt-in auth diagnostics.
 *
 * Logs high-level auth lifecycle events (login click, OAuth start/return,
 * session handoff, sign-in/out events, protected-route guard decisions) to
 * help diagnose login/re-login regressions across browsers.
 *
 * SAFETY: never pass access/refresh tokens, passwords, OAuth codes, or any
 * other secret to `logAuthEvent`. Only pass booleans, counts, ids, and
 * event/state names.
 *
 * Off by default in production. Enabled automatically in dev, or by setting
 * `localStorage["ucf:auth-debug"] = "1"` in any environment.
 */

const DEBUG_STORAGE_KEY = "ucf:auth-debug";

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1") return true;
  } catch {
    // Storage may be unavailable (private mode, disabled cookies, etc).
  }
  return Boolean(import.meta.env?.DEV);
}

export type AuthDiagnosticDetail = Record<string, string | number | boolean | null | undefined>;

export function logAuthEvent(event: string, detail?: AuthDiagnosticDetail): void {
  if (!isEnabled()) return;
  console.info(`[auth] ${event}`, detail ?? {});
}
