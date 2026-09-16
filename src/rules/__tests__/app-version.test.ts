import { describe, expect, it } from "vitest";
import { isNewBuildAvailable } from "@/lib/app-version";

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
});