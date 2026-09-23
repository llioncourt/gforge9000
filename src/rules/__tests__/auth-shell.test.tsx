import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DiceProvider, useDice } from "@/components/app/dice-context";
import { I18nProvider } from "@/i18n/provider";
import { createAuthInvalidationHandler, isAuthShellPath } from "@/lib/app-runtime";
import { runAuthRequest } from "@/lib/auth-submit";
import {
  isObsoleteCacheKey,
  isObsoleteWorkerUrl,
  retireObsoleteWorkers,
} from "@/lib/sw-retirement";

describe("auth shell boundary", () => {
  it("selects the minimal shell only for /auth", () => {
    expect(isAuthShellPath("/auth")).toBe(true);
    expect(isAuthShellPath("/auth/")).toBe(true);
    for (const path of ["/", "/dashboard", "/authx", "/auth/callback", "/campaigns/1"]) {
      expect(isAuthShellPath(path)).toBe(false);
    }
  });

  it("mounts the global runtime only outside /auth (render-time check)", () => {
    const mounted: string[] = [];
    function Runtime({ children }: { children: ReactNode }) {
      mounted.push("runtime");
      return createElement("div", null, children);
    }
    function Page() {
      mounted.push("page");
      return createElement("main", null, "page");
    }
    function Shell({ pathname }: { pathname: string }) {
      return isAuthShellPath(pathname)
        ? createElement(Page)
        : createElement(Runtime, null, createElement(Page));
    }

    renderToStaticMarkup(createElement(Shell, { pathname: "/auth" }));
    expect(mounted).toEqual(["page"]);

    mounted.length = 0;
    renderToStaticMarkup(createElement(Shell, { pathname: "/dashboard" }));
    expect(mounted).toEqual(["runtime", "page"]);
  });

  it("keeps useDice available on /auth (DiceProvider is mounted on every route)", () => {
    // Regression for the production freeze: during a transition toward /auth
    // the outgoing authenticated tree still renders and calls useDice while
    // authShell has already flipped. DiceProvider must wrap both branches.
    function OutgoingPage() {
      const dice = useDice();
      expect(dice).toBeDefined();
      return createElement("main", null, "outgoing");
    }

    expect(() =>
      renderToStaticMarkup(
        createElement(
          I18nProvider,
          { initialLocale: "en" },
          createElement(DiceProvider, null, createElement(OutgoingPage)),
        ),
      ),
    ).not.toThrow();
  });
});

describe("global auth callback scheduling", () => {
  function harness() {
    const calls: string[] = [];
    const scheduled: (() => void)[] = [];
    const handler = createAuthInvalidationHandler({
      invalidateRouter: () => {
        calls.push("router");
      },
      invalidateQueries: () => {
        calls.push("queries");
      },
      schedule: (run) => {
        scheduled.push(run);
        return scheduled.length - 1;
      },
      cancel: (handle) => {
        scheduled[handle as number] = () => undefined;
      },
    });
    const flush = () => {
      const pending = scheduled.splice(0, scheduled.length);
      for (const run of pending) run();
    };
    return { calls, handler, flush, scheduled };
  }

  it("does no router/query work synchronously inside the callback", () => {
    const { calls, handler, flush } = harness();
    handler.handle("SIGNED_IN", "user:1");
    expect(calls).toEqual([]);
    flush();
    expect(calls).toEqual(["router", "queries"]);
  });

  it("ignores events that do not change the session", () => {
    const { calls, handler, flush, scheduled } = harness();
    handler.handle("INITIAL_SESSION", "user:1");
    handler.handle("TOKEN_REFRESHED", "user:1");
    expect(scheduled).toHaveLength(0);
    flush();
    expect(calls).toEqual([]);
  });

  it("coalesces repeated SIGNED_IN for the same session", () => {
    const { calls, handler, flush } = harness();
    handler.handle("SIGNED_IN", "user:1");
    handler.handle("SIGNED_IN", "user:1");
    handler.handle("SIGNED_IN", "user:1");
    flush();
    expect(calls).toEqual(["router", "queries"]);
  });

  it("still reacts to a different session, user change and sign-out", () => {
    const { calls, handler, flush } = harness();
    handler.handle("SIGNED_IN", "user:1");
    flush();
    handler.handle("SIGNED_IN", "user:2");
    flush();
    handler.handle("USER_UPDATED", "user:2b");
    flush();
    handler.handle("SIGNED_OUT", null);
    flush();
    expect(calls).toEqual([
      "router",
      "queries",
      "router",
      "queries",
      "router",
      "queries",
      "router",
    ]);
  });

  it("drops scheduled work after dispose (unmount)", () => {
    const { calls, handler, flush } = harness();
    handler.handle("SIGNED_IN", "user:1");
    handler.dispose();
    flush();
    expect(calls).toEqual([]);
  });

  it("swallows invalidation failures instead of rejecting", () => {
    const scheduled: (() => void)[] = [];
    const handler = createAuthInvalidationHandler({
      invalidateRouter: () => Promise.reject(new Error("boom")),
      invalidateQueries: () => {
        throw new Error("boom");
      },
      schedule: (run) => {
        scheduled.push(run);
        return scheduled.length - 1;
      },
      cancel: () => undefined,
    });
    handler.handle("SIGNED_IN", "user:1");
    expect(() => scheduled[0]!()).not.toThrow();
  });
});

describe("obsolete service-worker retirement (page side)", () => {
  it("recognises only our own worker script and cache prefix", () => {
    expect(isObsoleteWorkerUrl("https://gforge9000.lovable.app/sw.js")).toBe(true);
    expect(isObsoleteWorkerUrl("https://gforge9000.lovable.app/other-sw.js")).toBe(false);
    expect(isObsoleteWorkerUrl(null)).toBe(false);
    expect(isObsoleteCacheKey("ucf-v1-pages")).toBe(true);
    expect(isObsoleteCacheKey("some-other-app-cache")).toBe(false);
  });

  it("unregisters only our worker and never touches caches", async () => {
    const unregisterOurs = vi.fn().mockResolvedValue(true);
    const unregisterOther = vi.fn().mockResolvedValue(true);
    const result = await retireObsoleteWorkers(async () => [
      { active: { scriptURL: "https://x.app/sw.js" }, unregister: unregisterOurs },
      { active: { scriptURL: "https://x.app/vendor-sw.js" }, unregister: unregisterOther },
    ]);

    expect(unregisterOurs).toHaveBeenCalledTimes(1);
    expect(unregisterOther).not.toHaveBeenCalled();
    expect(result).toEqual({ inspected: 2, unregistered: 1, skipped: 1 });
  });

  it("keeps going when one unregister rejects", async () => {
    const ok = vi.fn().mockResolvedValue(true);
    const result = await retireObsoleteWorkers(async () => [
      { active: { scriptURL: "/sw.js" }, unregister: () => Promise.reject(new Error("nope")) },
      { waiting: { scriptURL: "/sw.js" }, unregister: ok },
    ]);
    expect(ok).toHaveBeenCalled();
    expect(result.unregistered).toBe(1);
  });
});

describe("public/sw.js tombstone behaviour", () => {
  async function runActivate(cacheKeys: string[], deleteImpl?: (key: string) => Promise<boolean>) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(process.cwd(), "public/sw.js"), "utf-8");

    const deleted: string[] = [];
    const listeners: Record<string, (event: { waitUntil: (p: Promise<unknown>) => void }) => void> =
      {};
    const claim = vi.fn().mockResolvedValue(undefined);
    const unregister = vi.fn().mockResolvedValue(true);
    const cachesStub = {
      keys: async () => cacheKeys,
      delete: async (key: string) => {
        deleted.push(key);
        return deleteImpl ? deleteImpl(key) : true;
      },
    };
    const self = {
      addEventListener: (type: string, cb: (e: never) => void) => {
        listeners[type] = cb as never;
      },
      skipWaiting: vi.fn(),
      clients: { claim },
      registration: { unregister },
    };

    new Function("self", "caches", src)(self, cachesStub);

    let waited: Promise<unknown> = Promise.resolve();
    listeners["activate"]?.({ waitUntil: (p) => (waited = p) });
    await waited;
    return { deleted, claim, unregister, self };
  }

  it("deletes only ucf- caches, sequentially, then claims and unregisters", async () => {
    const { deleted, claim, unregister } = await runActivate([
      "ucf-v1-pages",
      "unrelated-cache",
      "ucf-v1-assets",
    ]);
    expect(deleted).toEqual(["ucf-v1-pages", "ucf-v1-assets"]);
    expect(claim).toHaveBeenCalled();
    expect(unregister).toHaveBeenCalled();
  });

  it("still unregisters when a cache deletion fails", async () => {
    const { unregister, claim } = await runActivate(["ucf-v1-pages"], () =>
      Promise.reject(new Error("cache api down")),
    );
    expect(claim).toHaveBeenCalled();
    expect(unregister).toHaveBeenCalled();
  });
});

describe("sign-in submit recovery", () => {
  it("returns ok data on success", async () => {
    const result = await runAuthRequest(async () => ({ data: { session: null }, error: null }));
    expect(result.status).toBe("ok");
  });

  it("recovers from a thrown request without leaking the message shape", async () => {
    const result = await runAuthRequest(async () => {
      throw new Error("network down");
    });
    expect(result).toEqual({ status: "thrown", message: "network down" });
  });

  it("times out a hung request on a finite deadline", async () => {
    const result = await runAuthRequest(() => new Promise(() => undefined), {
      timeoutMs: 5,
    });
    expect(result.status).toBe("timeout");
  });

  it("does not produce an unhandled rejection when a hung request fails late", async () => {
    let reject: (e: Error) => void = () => undefined;
    const result = await runAuthRequest(
      () =>
        new Promise((_res, rej) => {
          reject = rej;
        }),
      { timeoutMs: 5 },
    );
    expect(result.status).toBe("timeout");
    reject(new Error("late failure"));
    await new Promise((r) => setTimeout(r, 10));
  });
});
