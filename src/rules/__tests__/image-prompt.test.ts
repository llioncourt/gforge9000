import { describe, expect, it } from "vitest";
import { buildImagePrompt } from "@/lib/image-prompt";

describe("buildImagePrompt", () => {
  it("includes name, concept, appearance, traits, gear and tech level", () => {
    const prompt = buildImagePrompt({
      name: "aDEvogado",
      concept: "Silver-tongued space lawyer",
      techLevel: 9,
      appearance: { age: "38", hair: "Black, slicked back", eyes: "Green", height: "" },
      traits: ["Charisma +2", "Smooth Operator 2"],
      gear: ["Briefcase", "Laser Pistol"],
    });
    expect(prompt).toContain("aDEvogado, Silver-tongued space lawyer");
    expect(prompt).toContain("Age: 38");
    expect(prompt).toContain("Hair: Black, slicked back");
    expect(prompt).not.toContain("Height");
    expect(prompt).toContain("Charisma +2");
    expect(prompt).toContain("Laser Pistol");
    expect(prompt).toContain("Tech level 9");
    expect(prompt).toContain("digital painting");
  });

  it("is deterministic and skips empty sections", () => {
    const input = { name: "Solo", concept: null, appearance: {}, traits: [], gear: [] };
    const a = buildImagePrompt(input);
    const b = buildImagePrompt(input);
    expect(a).toBe(b);
    expect(a).not.toContain("Appearance");
    expect(a).not.toContain("Notable traits");
    expect(a).not.toContain("Equipment");
    expect(a).not.toContain("Tech level");
    expect(a).toContain("a character");
  });
});
