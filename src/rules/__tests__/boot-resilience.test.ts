import { describe, expect, it } from "vitest";

import { createAuthInvalidationHandler } from "@/lib/app-runtime";
import { decideProtectedAccess, isTransientAuthError } from "@/lib/auth-guard";
import { shouldShowCampaignIntroGate } from "@/lib/campaign-intro";
import { cachedSignedUrl, clearSignedUrlCache, SIGNED_URL_REUSE_MS } from "@/lib/signed-url-cache";
import {
  STALE_BUILD_RELOAD_WINDOW_MS,
  claimStaleBuildReload,
  type ReloadGuardStorage,
} from "@/lib/stale-build-recovery";

const USER = { id: "u1" };
const never = <T>() => new Promise<T>(() => undefined);

/** A timer the test fires by hand, so "the deadline passed" is deterministic. */
function manualTimer() {
  const pending: (() => void)[] = [];
  return {
    setTimeoutFn: (run: () => void) => {
      pending.push(run);
      return pending.length - 1;
    },
    clearTimeoutFn: (handle: unknown) => {
      pending[handle as number] = () => undefined;
    },
    fire: () => pending.splice(0, pending.length).forEach((run) => run()),
  };
}

const retryable = Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError" });

describe("protected area: the session check always ends", () => {
  it("reports 'unavailable' instead of waiting forever when the auth client never answers", async () => {
    const timer = manualTimer();
    const decision = decideProtectedAccess(
      { getSession: () => never(), getUser: () => never() },
      timer,
    );
    timer.fire();
    await expect(decision).resolves.toEqual({ outcome: "unavailable", reason: "timeout" });
  });

  it("does not treat a failed token renewal as 'signed out'", async () => {
    let askedServer = false;
    const decision = await decideProtectedAccess({
      getSession: async () => ({ data: { session: null }, error: retryable }),
      getUser: async () => {
        askedServer = true;
        return { data: { user: null }, error: retryable };
      },
    });
    expect(decision).toEqual({ outcome: "unavailable", reason: "network" });
    expect(askedServer).toBe(false);
  });

  it("does not treat an unreachable server as 'signed out' on the fallback either", async () => {
    const decision = await decideProtectedAccess({
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null }, error: retryable }),
    });
    expect(decision).toEqual({ outcome: "unavailable", reason: "network" });
  });

  it("times out the server fallback too", async () => {
    const timer = manualTimer();
    const decision = decideProtectedAccess(
      { getSession: async () => ({ data: { session: null } }), getUser: () => never() },
      timer,
    );
    // Let the first (answered) step finish so the fallback's deadline is armed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    timer.fire();
    await expect(decision).resolves.toEqual({ outcome: "unavailable", reason: "timeout" });
  });

  it("still redirects when the server positively says there is no session", async () => {
    const missing = Object.assign(new Error("Auth session missing!"), {
      name: "AuthSessionMissingError",
      status: 400,
    });
    const decision = await decideProtectedAccess({
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null }, error: missing }),
    });
    expect(decision).toEqual({ outcome: "redirect" });
  });

  it("still allows a stored session without touching the network", async () => {
    let askedServer = false;
    const decision = await decideProtectedAccess({
      getSession: async () => ({ data: { session: { user: USER } } }),
      getUser: async () => {
        askedServer = true;
        return { data: { user: USER }, error: null };
      },
    });
    expect(decision).toEqual({ outcome: "allow", source: "local-session", user: USER });
    expect(askedServer).toBe(false);
  });

  it("classifies transient failures narrowly", () => {
    expect(isTransientAuthError(retryable)).toBe(true);
    expect(isTransientAuthError({ status: 503 })).toBe(true);
    expect(isTransientAuthError({ name: "AuthApiError", status: 400 })).toBe(false);
    expect(isTransientAuthError(null)).toBe(false);
    expect(isTransientAuthError(new Error("boom"))).toBe(false);
  });
});

describe("restored-session replay does not refetch the app", () => {
  function harness() {
    const calls: string[] = [];
    const scheduled: (() => void)[] = [];
    const handler = createAuthInvalidationHandler({
      invalidateRouter: () => void calls.push("router"),
      invalidateQueries: () => void calls.push("queries"),
      schedule: (run) => {
        scheduled.push(run);
        return scheduled.length - 1;
      },
      cancel: (handle) => {
        scheduled[handle as number] = () => undefined;
      },
    });
    const flush = () => scheduled.splice(0, scheduled.length).forEach((run) => run());
    return { calls, handler, flush };
  }

  it("ignores the replay when the page's session was declared first", () => {
    const { calls, handler, flush } = harness();
    handler.prime("user:1");
    handler.handle("SIGNED_IN", "user:1");
    flush();
    expect(calls).toEqual([]);
  });

  it("ignores the replay when it arrives before the declaration", () => {
    const { calls, handler, flush } = harness();
    handler.handle("SIGNED_IN", "user:1");
    handler.prime("user:1");
    flush();
    expect(calls).toEqual([]);
  });

  it("still reacts when a different person signs in", () => {
    const { calls, handler, flush } = harness();
    handler.prime("user:1");
    handler.handle("SIGNED_IN", "user:2");
    flush();
    expect(calls).toEqual(["router", "queries"]);
  });

  it("never cancels a sign-out or a later change", () => {
    const { calls, handler, flush } = harness();
    handler.handle("SIGNED_IN", "user:1");
    handler.handle("SIGNED_OUT", null);
    handler.prime("user:1");
    flush();
    expect(calls).toEqual(["router"]);
  });

  it("a declaration with no session changes nothing", () => {
    const { calls, handler, flush } = harness();
    handler.handle("SIGNED_IN", "user:1");
    handler.prime(null);
    flush();
    expect(calls).toEqual(["router", "queries"]);
  });
});

describe("campaign intro screen", () => {
  const intro = { version: "v2" } as never;
  const seen = { intro_version: "v2", do_not_show_again: true } as never;

  it("stays closed while the intro or the viewer's record is still loading", () => {
    expect(
      shouldShowCampaignIntroGate({
        intro: undefined,
        viewKnown: false,
        view: undefined,
        continuedVersion: null,
      }),
    ).toBe(false);
    expect(
      shouldShowCampaignIntroGate({
        intro,
        viewKnown: false,
        view: undefined,
        continuedVersion: null,
      }),
    ).toBe(false);
  });

  it("stays closed for a campaign without an intro", () => {
    expect(
      shouldShowCampaignIntroGate({
        intro: null,
        viewKnown: true,
        view: null,
        continuedVersion: null,
      }),
    ).toBe(false);
  });

  it("stays closed once this version was already watched", () => {
    expect(
      shouldShowCampaignIntroGate({ intro, viewKnown: true, view: seen, continuedVersion: null }),
    ).toBe(false);
  });

  it("opens for a viewer who has not watched this version", () => {
    expect(
      shouldShowCampaignIntroGate({ intro, viewKnown: true, view: null, continuedVersion: null }),
    ).toBe(true);
    expect(
      shouldShowCampaignIntroGate({
        intro,
        viewKnown: true,
        view: { intro_version: "v1", do_not_show_again: true } as never,
        continuedVersion: null,
      }),
    ).toBe(true);
  });

  it("closes after the viewer continues in this visit", () => {
    expect(
      shouldShowCampaignIntroGate({ intro, viewKnown: true, view: null, continuedVersion: "v2" }),
    ).toBe(false);
  });
});

describe("signed image address reuse", () => {
  it("asks once, shares calls in flight, and asks again after the reuse window", async () => {
    clearSignedUrlCache();
    let clock = 0;
    let calls = 0;
    const sign = async () => `https://signed.example/${++calls}`;
    const now = () => clock;

    const [first, concurrent] = await Promise.all([
      cachedSignedUrl("portraits", "a.avif", sign, now),
      cachedSignedUrl("portraits", "a.avif", sign, now),
    ]);
    expect(first).toBe("https://signed.example/1");
    expect(concurrent).toBe(first);

    clock += SIGNED_URL_REUSE_MS - 1;
    expect(await cachedSignedUrl("portraits", "a.avif", sign, now)).toBe(first);
    expect(calls).toBe(1);

    clock += 2;
    expect(await cachedSignedUrl("portraits", "a.avif", sign, now)).toBe(
      "https://signed.example/2",
    );
  });

  it("keeps buckets and paths apart, never keeps a failure, and can be cleared", async () => {
    clearSignedUrlCache();
    let calls = 0;
    const sign = async () => `u${++calls}`;
    expect(await cachedSignedUrl("portraits", "a", sign)).toBe("u1");
    expect(await cachedSignedUrl("campaign-assets", "a", sign)).toBe("u2");
    expect(await cachedSignedUrl("portraits", "b", sign)).toBe("u3");

    let attempts = 0;
    const flaky = async () => (++attempts === 1 ? null : "ok");
    expect(await cachedSignedUrl("portraits", "c", flaky)).toBeNull();
    expect(await cachedSignedUrl("portraits", "c", flaky)).toBe("ok");

    await expect(
      cachedSignedUrl("portraits", "d", async () => {
        throw new Error("denied");
      }),
    ).rejects.toThrow("denied");

    clearSignedUrlCache();
    expect(await cachedSignedUrl("portraits", "a", sign)).toBe("u4");
  });
});

describe("stale build recovery", () => {
  function memory(): ReloadGuardStorage {
    const data = new Map<string, string>();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    };
  }

  it("reloads once and never loops", () => {
    const storage = memory();
    expect(claimStaleBuildReload(storage, 1_000)).toBe(true);
    expect(claimStaleBuildReload(storage, 2_000)).toBe(false);
    expect(claimStaleBuildReload(storage, 1_000 + STALE_BUILD_RELOAD_WINDOW_MS + 1)).toBe(true);
  });

  it("does not reload when it cannot rule out a loop", () => {
    expect(claimStaleBuildReload(null, 1_000)).toBe(false);
    const broken: ReloadGuardStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    };
    expect(claimStaleBuildReload(broken, 1_000)).toBe(false);
  });
});
