import { describe, expect, it } from "vitest";
import { extractAppAssetId, isNewAppAssetAvailable, isNewBuildAvailable } from "@/lib/app-version";

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
