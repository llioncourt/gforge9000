import { describe, expect, it } from "vitest";

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
