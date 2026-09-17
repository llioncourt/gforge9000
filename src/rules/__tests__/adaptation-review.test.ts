import { describe, expect, it } from "vitest";
import { acceptableSelection, splitForReview } from "@/lib/adaptation/review";

const fact = (id: string, over: Partial<Record<string, unknown>> = {}) => ({
  id,
  statement: `statement ${id}`,
  provenance_type: "ai_inference",
  canon_status: "needs_review",
  ...over,
}) as never;

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
