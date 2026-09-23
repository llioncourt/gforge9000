import { afterEach, describe, expect, it, vi } from "vitest";

import { PWA_ENABLED, isServiceWorkerAllowed } from "@/lib/pwa";

describe("PWA_ENABLED", () => {
  it("is off for this release (background push disabled)", () => {
    expect(PWA_ENABLED).toBe(false);
  });
});

describe("isServiceWorkerAllowed", () => {
  it("blocks every host, including production, while PWA_ENABLED is false", () => {
    expect(isServiceWorkerAllowed("gforge9000.lovable.app", false)).toBe(false);
    expect(isServiceWorkerAllowed("charforge.example.com", false)).toBe(false);
  });

  it("blocks dev, localhost, preview and sandbox hosts regardless of the flag", () => {
    expect(isServiceWorkerAllowed("gforge9000.lovable.app", true)).toBe(false);
    expect(isServiceWorkerAllowed("localhost", false)).toBe(false);
    expect(isServiceWorkerAllowed("127.0.0.1", false)).toBe(false);
    expect(isServiceWorkerAllowed("id-preview--abc.lovable.app", false)).toBe(false);
    expect(isServiceWorkerAllowed("project--abc-dev.lovable.app", false)).toBe(false);
  });
});

describe("background push (disabled release)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("reports push as unsupported without touching navigator.serviceWorker", async () => {
    const { isPushSupported } = await import("@/lib/push");
    expect(isPushSupported()).toBe(false);
  });

  it("fails fast without awaiting navigator.serviceWorker.ready", async () => {
    const readySpy = vi.fn().mockReturnValue(new Promise(() => undefined));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: { then: readySpy } },
    });

    const { enableBackgroundPush, disableBackgroundPush } = await import("@/lib/push");

    await expect(enableBackgroundPush()).resolves.toBe(false);
    await expect(disableBackgroundPush()).resolves.toBeUndefined();
    expect(readySpy).not.toHaveBeenCalled();
  });
});
