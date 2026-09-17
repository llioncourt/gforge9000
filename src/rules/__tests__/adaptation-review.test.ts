import { describe, expect, it } from "vitest";
import { acceptableSelection, splitForReview, type ReviewableFact } from "@/lib/adaptation/review";

const fact = (id: string, over: Partial<ReviewableFact> = {}): ReviewableFact => ({
  id,
  statement: `statement ${id}`,
  provenance_type: "ai_inference",
  canon_status: "needs_review",
  ...over,
});

describe("adaptation review selection", () => {
  it("only offers pending statements", () => {
    const split = splitForReview([fact("a"), fact("b", { canon_status: "confirmed" })]);
    expect(split.reviewable.map((f) => f.id)).toEqual(["a"]);
  });

  it("keeps conflict statements out of the reviewable list", () => {
    const split = splitForReview([fact("a"), fact("b", { provenance_type: "conflict" })]);
    expect(split.reviewable.map((f) => f.id)).toEqual(["a"]);
    expect(split.blocked.map((f) => f.id)).toEqual(["b"]);
  });

  it("treats a recorded contradiction as blocking", () => {
    const split = splitForReview([fact("a", { conflict_with: ["x"] })]);
    expect(split.reviewable).toHaveLength(0);
    expect(split.blocked.map((f) => f.id)).toEqual(["a"]);
  });

  it("drops unacceptable or duplicated ids from a selection", () => {
    const facts = [fact("a"), fact("b", { provenance_type: "conflict" }), fact("c", { canon_status: "confirmed" })];
    expect(acceptableSelection(facts, ["a", "a", "b", "c", "zz"])).toEqual(["a"]);
  });
});

describe("editor refresh safety", () => {
  it("applies a server refresh when nothing was typed", async () => {
    const { decideSync } = await import("@/lib/form-sync");
    expect(decideSync({ name: "A" }, { name: "A" }, { name: "B" })).toBe("apply");
  });

  it("keeps unsaved edits when the server moved on", async () => {
    const { decideSync } = await import("@/lib/form-sync");
    expect(decideSync({ name: "A" }, { name: "local" }, { name: "B" })).toBe("keep-local");
  });

  it("does nothing when the refresh carries no change", async () => {
    const { decideSync } = await import("@/lib/form-sync");
    expect(decideSync({ name: "A" }, { name: "local" }, { name: "A" })).toBe("noop");
  });
});
