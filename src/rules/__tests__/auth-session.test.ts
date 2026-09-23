import { describe, expect, it, vi, beforeEach } from "vitest";
import { decideProtectedAccess } from "@/lib/auth-guard";

/**
 * Regression tests for the browser login / re-login flow (P0-01).
 *
 * These use in-memory fakes for the Supabase auth client, no network calls.
 */

type FakeUser = { id: string; email: string };
type FakeSession = { user: FakeUser; access_token: string } | null;
type AuthChangeCallback = (event: string, session: FakeSession) => void;

/** A minimal in-memory stand-in for supabase.auth, enough to exercise the
 * beforeLoad guard and the shared session store's contract. */
function createFakeAuthClient() {
  let session: FakeSession = null;
  const listeners = new Set<AuthChangeCallback>();
  let getUserNetworkError: Error | null = null;

  function emit(event: string) {
    for (const listener of listeners) listener(event, session);
  }

  return {
    // test helpers
    __setSession(next: FakeSession) {
      session = next;
    },
    __setGetUserNetworkError(err: Error | null) {
      getUserNetworkError = err;
    },
    __emit(event: string) {
      emit(event);
    },
    // supabase-like surface
    async getSession() {
      return { data: { session } };
    },
    async getUser() {
      if (getUserNetworkError) return { data: { user: null }, error: getUserNetworkError };
      if (!session) return { data: { user: null }, error: new Error("no session") };
      return { data: { user: session.user }, error: null };
    },
    async signInWithPassword({ email }: { email: string; password: string }) {
      session = { user: { id: "u1", email }, access_token: "fake-token" };
      emit("SIGNED_IN");
      return { data: { session }, error: null };
    },
    async signOut() {
      session = null;
      emit("SIGNED_OUT");
      return { error: null };
    },
    onAuthStateChange(cb: AuthChangeCallback) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
  };
}

/** Calls the real shared guard (`decideProtectedAccess`) against the fake
 * Supabase auth client, so these tests exercise the exact same logic that
 * `_authenticated/route.tsx` uses in production. */
async function runProtectedGuard(auth: ReturnType<typeof createFakeAuthClient>) {
  return decideProtectedAccess({
    getSession: () => auth.getSession(),
    getUser: () => auth.getUser(),
  });
}

describe("auth session regressions", () => {
  let auth: ReturnType<typeof createFakeAuthClient>;

  beforeEach(() => {
    auth = createFakeAuthClient();
  });

  it("transitions to a signed-in session after password sign-in", async () => {
    const events: string[] = [];
    auth.onAuthStateChange((event) => events.push(event));

    const result = await auth.signInWithPassword({ email: "a@b.com", password: "secret" });

    expect(result.error).toBeNull();
    expect(result.data.session?.user.email).toBe("a@b.com");
    expect(events).toContain("SIGNED_IN");
  });

  it("supports sign-out followed by a clean re-login with no stuck state", async () => {
    await auth.signInWithPassword({ email: "a@b.com", password: "secret" });
    expect((await auth.getSession()).data.session).not.toBeNull();

    await auth.signOut();
    expect((await auth.getSession()).data.session).toBeNull();

    const relogin = await auth.signInWithPassword({ email: "a@b.com", password: "secret" });
    expect(relogin.error).toBeNull();
    expect((await auth.getSession()).data.session?.user.email).toBe("a@b.com");
  });

  it("routes to the protected area once the OAuth-returned session is set", async () => {
    // Simulates lovable.auth.signInWithOAuth() completing and calling
    // supabase.auth.setSession() with the returned tokens.
    auth.__setSession({ user: { id: "u2", email: "g@b.com" }, access_token: "oauth-token" });
    auth.__emit("SIGNED_IN");

    const guard = await runProtectedGuard(auth);
    expect(guard.outcome).toBe("allow");
  });

  it("does not bounce a just-authenticated user even if getUser() would fail", async () => {
    // Regression for AUTH-005: getUser() racing/failing during the token
    // handoff must NOT cause a redirect to /auth when a local session exists.
    auth.__setSession({ user: { id: "u3", email: "c@d.com" }, access_token: "tok" });
    auth.__setGetUserNetworkError(new Error("network hiccup"));

    const guard = await runProtectedGuard(auth);
    expect(guard.outcome).toBe("allow");
    expect(guard.outcome === "allow" && guard.source).toBe("local-session");
  });

  it("redirects to /auth when there is no local session and getUser() has none either", async () => {
    const guard = await runProtectedGuard(auth);
    expect(guard.outcome).toBe("redirect");
  });

  it("falls back to getUser() when there is no local session but the server has one", async () => {
    // e.g. a session restored via a cookie/broker without a local copy yet.
    const getSessionSpy = vi.spyOn(auth, "getSession");
    const originalGetUser = auth.getUser.bind(auth);
    auth.getUser = async () => {
      return { data: { user: { id: "u4", email: "e@f.com" } }, error: null };
    };

    const guard = await runProtectedGuard(auth);
    expect(guard.outcome).toBe("allow");
    expect(guard.outcome === "allow" && guard.source).toBe("getUser");

    getSessionSpy.mockRestore();
    auth.getUser = originalGetUser;
  });
});
