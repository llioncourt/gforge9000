import { describe, expect, it } from "vitest";

import { applyDraft, buildContext, buildLorePrompt, draftFieldCatalogue } from "@/lib/ai-lore";

describe("ai lore drafts", () => {
  it("lists only free-text fields in the catalogue", () => {
    const keys = draftFieldCatalogue("LOCATION").map((f) => f.key);
    expect(keys).toContain("history");
    expect(keys).not.toContain("location_type");
  });

  it("builds a prompt with brief, context and field keys", () => {
    const prompt = buildLorePrompt("NPC", "  a grumpy blacksmith  ", "LOCATION: Ashford");
    expect(prompt).toContain("a grumpy blacksmith");
    expect(prompt).toContain("LOCATION: Ashford");
    expect(prompt).toContain("- personality");
  });

  it("omits the context block when there is none", () => {
    expect(buildLorePrompt("NPC", "a smuggler")).not.toContain("Existing campaign material");
  });

  it("splits list fields and drops unknown or empty keys", () => {
    const applied = applyDraft("NPC", {
      name: "  Mira  ",
      summary: "A smuggler.",
      fields: [
        { key: "personality", value: " Wry and watchful " },
        { key: "flaws", value: "- Greedy\n2. Proud\n" },
        { key: "not_a_field", value: "ignored" },
        { key: "voice", value: "   " },
      ],
    });
    expect(applied.name).toBe("Mira");
    expect(applied.data.personality).toBe("Wry and watchful");
    expect(applied.data.flaws).toEqual(["Greedy", "Proud"]);
    expect(applied.data.not_a_field).toBeUndefined();
    expect(applied.data.voice).toBeUndefined();
  });

  it("falls back to a placeholder name and clamps the summary", () => {
    const applied = applyDraft("NPC", { name: " ", summary: "x".repeat(900), fields: [] });
    expect(applied.name).toBe("Untitled");
    expect(applied.summary).toHaveLength(400);
  });

  it("builds a compact context limited in size", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      kind: "NPC",
      name: `N${i}`,
      summary: i === 0 ? "first" : null,
    }));
    const context = buildContext(rows);
    expect(context.split("\n")).toHaveLength(40);
    expect(context.startsWith("NPC: N0 — first")).toBe(true);
  });
});
