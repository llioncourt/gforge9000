import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractAppAssetId,
  isNewAppAssetAvailable,
  isNewBuildAvailable,
  isUpdateAvailable,
} from "@/lib/app-version";

describe("app version checks", () => {
  it("detects a different deployed build", () => {
    expect(isNewBuildAvailable("build-a", "build-b")).toBe(true);
  });

  it("does not flag the currently loaded build", () => {
    expect(isNewBuildAvailable("build-a", "build-a")).toBe(false);
  });

  it("ignores missing or malformed responses", () => {
    expect(isNewBuildAvailable("build-a", null)).toBe(false);
    expect(isNewBuildAvailable("build-a", "")).toBe(false);
    expect(isNewBuildAvailable("build-a", 42)).toBe(false);
  });

  it("extracts the current application asset from published HTML", () => {
    expect(
      extractAppAssetId('<script type="module" src="/assets/index-current123.js"></script>'),
    ).toBe("/assets/index-current123.js");
    expect(extractAppAssetId("<main>No application script</main>")).toBeNull();
  });

  it("detects a different published application asset", () => {
    expect(isNewAppAssetAvailable("/assets/index-old.js", "/assets/index-new.js")).toBe(true);
    expect(isNewAppAssetAvailable("/assets/index-same.js", "/assets/index-same.js")).toBe(false);
    expect(isNewAppAssetAvailable(null, "/assets/index-new.js")).toBe(false);
  });
});

describe("isUpdateAvailable", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses the version endpoint as the single authoritative probe when it succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: "build-b" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await isUpdateAvailable("build-a", "/assets/index-a.js");
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/public/version");
  });

  it("does not call the HTML fallback when the version probe succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ buildId: "build-a" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await isUpdateAvailable("build-a", "/assets/index-a.js");
    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the index-HTML asset probe only when the version probe fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<script src="/assets/index-new.js"></script>',
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await isUpdateAvailable("build-a", "/assets/index-old.js");
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns false when both probes fail", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await isUpdateAvailable("build-a", "/assets/index-old.js");
    expect(result).toBe(false);
  });
});
