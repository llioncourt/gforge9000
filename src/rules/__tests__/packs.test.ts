import { describe, expect, it } from "vitest";
import { allowedPacksOf, isPackAllowed, packGateReason } from "@/lib/packs";

describe("campaign content packs", () => {
  it("reads allowed packs defensively", () => {
    expect(allowedPacksOf(null)).toEqual([]);
    expect(allowedPacksOf({})).toEqual([]);
    expect(allowedPacksOf({ allowed_packs: ["A", " B ", ""] })).toEqual(["A", "B"]);
    expect(allowedPacksOf({ allowed_packs: "A" })).toEqual([]);
  });

  it("allows everything when no restriction is set", () => {
    expect(isPackAllowed("Anything", [])).toBe(true);
    expect(isPackAllowed(null, [])).toBe(true);
  });

  it("restricts named packs to the allow list, case-insensitively", () => {
    expect(isPackAllowed("Core Generic Pack", ["core generic pack"])).toBe(true);
    expect(isPackAllowed("Third Party", ["Core Generic Pack"])).toBe(false);
  });

  it("always allows personal entries without a pack", () => {
    expect(isPackAllowed(null, ["Core Generic Pack"])).toBe(true);
    expect(isPackAllowed("  ", ["Core Generic Pack"])).toBe(true);
  });

  it("explains why an entry is blocked", () => {
    expect(packGateReason("Third Party", ["Core"])).toContain("Third Party");
    expect(packGateReason("Core", ["Core"])).toBeNull();
  });
});
