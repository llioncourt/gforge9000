/**
 * Pure protected-route auth decision logic, extracted from the
 * `_authenticated` route's `beforeLoad` so it can be exercised directly by
 * tests without duplicating the logic.
 *
 * Local-session-first, `getUser()` server-validation fallback: a settled
 * local session is trusted so a freshly authenticated user isn't bounced to
 * /auth (see AUTH-005 / P0-01 regression).
 */

import { logAuthEvent } from "@/lib/auth-diagnostics";

export type ProtectedAccessUser = { id: string; [key: string]: unknown };

export type ProtectedAccessDecision =
  | { outcome: "allow"; source: "local-session" | "getUser"; user: ProtectedAccessUser }
  | { outcome: "redirect" };

export type ProtectedAccessDeps = {
  /** Mirrors `supabase.auth.getSession()`. */
  getSession: () => Promise<{ data: { session: { user: ProtectedAccessUser } | null } }>;
  /** Mirrors `supabase.auth.getUser()`. */
  getUser: () => Promise<{ data: { user: ProtectedAccessUser | null }; error: unknown }>;
};

/**
 * Decides whether a request to a protected route should be allowed, and
 * with which user, or should redirect to /auth.
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
): Promise<ProtectedAccessDecision> {
  const { data: sessionData } = await deps.getSession();
  logAuthEvent("guard:getSession", { hasSession: Boolean(sessionData.session) });

  if (sessionData.session) {
    logAuthEvent("guard:decision", { outcome: "allow", source: "local-session" });
    return { outcome: "allow", source: "local-session", user: sessionData.session.user };
  }

  // No locally hydrated session: fall back to asking the server directly,
  // which also covers a session restored from a cookie/broker without a
  // local copy yet.
  const { data, error } = await deps.getUser();
  logAuthEvent("guard:getUser", { ok: !error && Boolean(data.user) });

  if (error || !data.user) {
    logAuthEvent("guard:decision", { outcome: "redirect" });
    return { outcome: "redirect" };
  }

  logAuthEvent("guard:decision", { outcome: "allow", source: "getUser" });
  return { outcome: "allow", source: "getUser", user: data.user };
}
