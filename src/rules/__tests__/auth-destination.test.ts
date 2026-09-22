import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_DESTINATION,
  consumeDestination,
  clearDestination,
  rememberDestination,
  safeDestination,
} from "@/lib/auth/pending-destination";

describe("auth continuation targets", () => {
  beforeEach(() => {
    clearDestination();
  });

  it("accepts internal application paths", () => {
    expect(safeDestination("/dashboard")).toBe("/dashboard");
    expect(safeDestination("/campaigns/123")).toBe("/campaigns/123");
    expect(safeDestination("/oauth-consent?client_id=a&state=b")).toBe(
      "/oauth-consent?client_id=a&state=b",
    );
  });

  it("rejects anything that could leave the application", () => {
    expect(safeDestination("https://evil.test/x")).toBe(DEFAULT_DESTINATION);
    expect(safeDestination("//evil.test")).toBe(DEFAULT_DESTINATION);
    expect(safeDestination("/unknown-page")).toBe(DEFAULT_DESTINATION);
    expect(safeDestination(undefined)).toBe(DEFAULT_DESTINATION);
    expect(safeDestination(42)).toBe(DEFAULT_DESTINATION);
  });

  it("is consumed exactly once", () => {
    rememberDestination("/library");
    expect(consumeDestination()).toBe("/library");
    expect(consumeDestination()).toBeNull();
  });

  it("stores a sanitised value", () => {
    rememberDestination("https://evil.test");
    expect(consumeDestination()).toBe(DEFAULT_DESTINATION);
  });
});
