import { describe, expect, it } from "vitest";

import { matchesSearch, normaliseSearch, searchTokens } from "@/lib/search";

describe("normaliseSearch", () => {
  it("strips accents, case and punctuation", () => {
    expect(normaliseSearch("Visão Aguçada (Sight)")).toBe("visao agucada sight");
  });
});

describe("searchTokens", () => {
  it("returns no tokens for an empty query", () => {
    expect(searchTokens("  ")).toEqual([]);
  });
});

describe("matchesSearch", () => {
  const fields = ["Combat Reflexes", "Mental", "Quick to react", "Core", "combat"];

  it("matches everything when the query is empty", () => {
    expect(matchesSearch("", fields)).toBe(true);
  });

  it("matches tokens in any order", () => {
    expect(matchesSearch("reflexes combat", fields)).toBe(true);
  });

  it("ignores accents and punctuation", () => {
    expect(matchesSearch("combát-reflexes", fields)).toBe(true);
  });

  it("searches summary, pack and tags too", () => {
    expect(matchesSearch("react", fields)).toBe(true);
    expect(matchesSearch("core", fields)).toBe(true);
  });

  it("requires every token to match", () => {
    expect(matchesSearch("combat stealth", fields)).toBe(false);
  });

  it("tolerates missing fields", () => {
    expect(matchesSearch("stealth", ["Stealth", null, undefined])).toBe(true);
  });
});

describe("rankSearch", () => {
  const rows = [
    { name: "Hierarquia", summary: "confere poderes legais a certos membros" },
    { name: "Poderes Legais", summary: "jurisdicao local" },
    { name: "Poderes Legais (nacional)", summary: "jurisdicao nacional" },
  ];
  const select = (r: (typeof rows)[number]) => ({ name: r.name, fields: [r.summary] });

  it("puts exact name matches before description-only matches", () => {
    expect(rankSearch("poderes legais", rows, select).map((r) => r.name)).toEqual([
      "Poderes Legais",
      "Poderes Legais (nacional)",
      "Hierarquia",
    ]);
  });

  it("keeps every match and returns all rows for an empty query", () => {
    expect(rankSearch("", rows, select)).toHaveLength(3);
    expect(rankSearch("zzz", rows, select)).toHaveLength(0);
  });
});
