/**
 * Pure protected-route auth decision logic, extracted from the
 * `_authenticated` route's `beforeLoad` so it can be exercised directly by
 * tests without duplicating the logic.
 *
 * Local-session-first, `getUser()` server-validation fallback: a settled
 * local session is trusted so a freshly authenticated user isn't bounced to
 * /auth (see AUTH-005 / P0-01 regression).
 *
 * The decision is bounded in time and never mistakes "the auth service did
 * not answer" for "nobody is signed in": a stalled or failed token renewal
 * yields `unavailable`, so the caller can offer a retry instead of leaving a
 * blank page or forcing a new sign-in while the session is still stored.
 */

import { logAuthEvent } from "@/lib/auth-diagnostics";

export type ProtectedAccessUser = { id: string };

export type ProtectedAccessUnavailableReason = "timeout" | "network";

export type ProtectedAccessDecision =
  | { outcome: "allow"; source: "local-session" | "getUser"; user: ProtectedAccessUser }
  | { outcome: "redirect" }
  | { outcome: "unavailable"; reason: ProtectedAccessUnavailableReason };

export type ProtectedAccessDeps = {
  /** Mirrors `supabase.auth.getSession()`. */
  getSession: () => Promise<{
    data: { session: { user: ProtectedAccessUser } | null };
    error?: unknown;
  }>;
  /** Mirrors `supabase.auth.getUser()`. */
  getUser: () => Promise<{ data: { user: ProtectedAccessUser | null }; error: unknown }>;
};

export interface ProtectedAccessOptions {
  /** Upper bound for each auth call. */
  timeoutMs?: number;
  setTimeoutFn?: (run: () => void, ms: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}

/** How long the guard waits for the auth client before offering a retry. */
export const PROTECTED_ACCESS_TIMEOUT_MS = 12_000;

const TIMED_OUT = Symbol("auth-guard-timeout");

/**
 * True for failures that say nothing about the session itself: the request
 * never completed (offline, dropped connection, gateway hiccup).
 */
export function isTransientAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, status } = error as { name?: unknown; status?: unknown };
  if (name === "AuthRetryableFetchError") return true;
  return status === 0 || status === 502 || status === 503 || status === 504;
}

async function bounded<T>(
  call: () => Promise<T>,
  options: Required<ProtectedAccessOptions>,
): Promise<T | typeof TIMED_OUT> {
  let handle: unknown = null;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    handle = options.setTimeoutFn(() => resolve(TIMED_OUT), options.timeoutMs);
  });
  const work = call();
  // A late rejection after the deadline must never become unhandled.
  void work.catch(() => undefined);
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (handle !== null) options.clearTimeoutFn(handle);
  }
}

/**
 * Decides whether a request to a protected route should be allowed, and
 * with which user, should redirect to /auth, or cannot be decided right now.
 *
 * Prefer the locally hydrated session first. Right after sign-in (password
 * or OAuth), the session has already been persisted to local storage by
 * supabase-js before SIGNED_IN observers run, so this never does a network
 * round-trip and can't race the token handoff. Falling back straight to
 * `getUser()` (a network call) here is what caused just-authenticated users
 * to be bounced back to /auth in Edge/Firefox whenever that request was slow
 * or briefly failed during the handoff.
 */
export async function decideProtectedAccess(
  deps: ProtectedAccessDeps,
  options: ProtectedAccessOptions = {},
): Promise<ProtectedAccessDecision> {
  const resolved: Required<ProtectedAccessOptions> = {
    timeoutMs: options.timeoutMs ?? PROTECTED_ACCESS_TIMEOUT_MS,
    setTimeoutFn: options.setTimeoutFn ?? ((run, ms) => setTimeout(run, ms)),
    clearTimeoutFn: options.clearTimeoutFn ?? ((handle) => clearTimeout(handle as never)),
  };

  let sessionResult: Awaited<ReturnType<ProtectedAccessDeps["getSession"]>> | typeof TIMED_OUT;
  try {
    sessionResult = await bounded(deps.getSession, resolved);
  } catch (error) {
    logAuthEvent("guard:getSession", { hasSession: false, threw: true });
    if (isTransientAuthError(error)) {
      logAuthEvent("guard:decision", { outcome: "unavailable", reason: "network" });
      return { outcome: "unavailable", reason: "network" };
    }
    throw error;
  }

  if (sessionResult === TIMED_OUT) {
    logAuthEvent("guard:decision", { outcome: "unavailable", reason: "timeout" });
    return { outcome: "unavailable", reason: "timeout" };
  }

  const { data: sessionData, error: sessionError } = sessionResult;
  logAuthEvent("guard:getSession", { hasSession: Boolean(sessionData.session) });

  if (sessionData.session) {
    logAuthEvent("guard:decision", { outcome: "allow", source: "local-session" });
    return { outcome: "allow", source: "local-session", user: sessionData.session.user };
  }

  // The stored session could not be renewed because the request never
  // completed. The session is still on this device: asking for a new sign-in
  // here would be wrong, and asking the server again would fail the same way.
  if (isTransientAuthError(sessionError)) {
    logAuthEvent("guard:decision", { outcome: "unavailable", reason: "network" });
    return { outcome: "unavailable", reason: "network" };
  }

  // No locally hydrated session: fall back to asking the server directly,
  // which also covers a session restored from a cookie/broker without a
  // local copy yet.
  const userResult = await bounded(deps.getUser, resolved);
  if (userResult === TIMED_OUT) {
    logAuthEvent("guard:decision", { outcome: "unavailable", reason: "timeout" });
    return { outcome: "unavailable", reason: "timeout" };
  }

  const { data, error } = userResult;
  logAuthEvent("guard:getUser", { ok: !error && Boolean(data.user) });

  if (!data.user && isTransientAuthError(error)) {
    logAuthEvent("guard:decision", { outcome: "unavailable", reason: "network" });
    return { outcome: "unavailable", reason: "network" };
  }

  if (error || !data.user) {
    logAuthEvent("guard:decision", { outcome: "redirect" });
    return { outcome: "redirect" };
  }

  logAuthEvent("guard:decision", { outcome: "allow", source: "getUser" });
  return { outcome: "allow", source: "getUser", user: data.user };
}
