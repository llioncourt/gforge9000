import { describe, expect, it } from "vitest";

import { isServiceWorkerAllowed } from "@/lib/pwa";

describe("isServiceWorkerAllowed", () => {
  it("allows the published domain", () => {
    expect(isServiceWorkerAllowed("gforge9000.lovable.app", false)).toBe(true);
    expect(isServiceWorkerAllowed("charforge.example.com", false)).toBe(true);
  });

  it("blocks dev, localhost, preview and sandbox hosts", () => {
    expect(isServiceWorkerAllowed("gforge9000.lovable.app", true)).toBe(false);
    expect(isServiceWorkerAllowed("localhost", false)).toBe(false);
    expect(isServiceWorkerAllowed("127.0.0.1", false)).toBe(false);
    expect(isServiceWorkerAllowed("id-preview--abc.lovable.app", false)).toBe(false);
    expect(isServiceWorkerAllowed("project--abc-dev.lovable.app", false)).toBe(false);
  });
});
