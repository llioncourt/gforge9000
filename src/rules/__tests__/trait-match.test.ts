import { describe, expect, it } from "vitest";

import {
  applyCatalogue,
  buildCatalogue,
  buildMatchPrompt,
  candidatesFor,
  catalogueIndex,
  matchLocally,
  normaliseName,
  reconcileEntries,
  resolveMatches,
  type CatalogueEntry,
  type ImportedEntry,
} from "@/lib/trait-match";

function lib(partial: Partial<CatalogueEntry> & { kind: string; name: string }): CatalogueEntry {
  return {
    category: null,
    base_points: 0,
    cost_per_level: 0,
    summary: null,
    data: null,
    pack: null,
    ...partial,
  };
}

const rows: CatalogueEntry[] = [
  lib({ kind: "advantage", name: "Combat Reflexes", base_points: 15, pack: "Core", category: "Mental" }),
  lib({ kind: "advantage", name: "Acute Vision", base_points: 2, cost_per_level: 2, pack: "Core" }),
  lib({ kind: "skill", name: "Stealth", pack: "Core" }),
  lib({ kind: "advantage", name: "Psychic Bolt", base_points: 10, pack: "Psi" }),
];

function entry(partial: Partial<ImportedEntry> & { kind: string; name: string }): ImportedEntry {
  return { points: 0, levels: 1, data: {}, ...partial };
}

describe("normaliseName", () => {
  it("ignores accents, case, punctuation and parentheticals", () => {
    expect(normaliseName("Reflexos  de Combate")).toBe("reflexos de combate");
    expect(normaliseName("Acute Vision (Sight)")).toBe("acute vision");
    expect(normaliseName("Visão Aguçada")).toBe("visao agucada");
  });
});

describe("catalogue gating", () => {
  it("keeps only entries from enabled packs", () => {
    const gated = buildCatalogue(rows, ["Core"]);
    expect(gated.map((r) => r.name)).not.toContain("Psychic Bolt");
  });

  it("allows everything when no pack list is set", () => {
    expect(buildCatalogue(rows, [])).toHaveLength(4);
  });
});

describe("deterministic matching", () => {
  const index = catalogueIndex(buildCatalogue(rows, ["Core"]));

  it("matches on normalised name within the same kind", () => {
    expect(matchLocally(entry({ kind: "advantage", name: "combat  reflexes" }), index)?.name).toBe(
      "Combat Reflexes",
    );
  });

  it("does not match across kinds", () => {
    expect(matchLocally(entry({ kind: "skill", name: "Combat Reflexes" }), index)).toBeNull();
  });

  it("leaves equipment alone", () => {
    expect(matchLocally(entry({ kind: "equipment", name: "Stealth" }), index)).toBeNull();
  });
});

describe("AI resolution", () => {
  const index = catalogueIndex(buildCatalogue(rows, ["Core"]));

  it("accepts only answers pointing at real entries of the same kind", () => {
    const resolved = resolveMatches(
      [
        { source: "Reflexos de Combate", kind: "advantage", match: "Combat Reflexes" },
        { source: "Algo Inventado", kind: "advantage", match: "Made Up Thing" },
        { source: "Furtividade", kind: "advantage", match: "Stealth" },
        { source: "Nada", kind: "skill", match: "" },
      ],
      index,
    );
    expect(resolved.size).toBe(1);
    expect(resolved.get("advantage::reflexos de combate")?.name).toBe("Combat Reflexes");
  });

  it("builds a prompt listing items and candidates", () => {
    const prompt = buildMatchPrompt(
      [{ kind: "advantage", name: "Reflexos de Combate" }],
      candidatesFor(rows, [{ kind: "advantage", name: "Reflexos de Combate" }]),
    );
    expect(prompt).toContain("[advantage] Reflexos de Combate");
    expect(prompt).toContain("Combat Reflexes");
    expect(prompt).not.toContain("Stealth");
  });
});

describe("applying a match", () => {
  it("takes identity and points from the library but keeps character data", () => {
    const target = rows[1]!; // Acute Vision, 2 + 2/level
    const applied = applyCatalogue(
      entry({ kind: "advantage", name: "Visão Aguçada", levels: 3, points: 0, data: { note: "x" } }),
      target,
    );
    expect(applied.name).toBe("Acute Vision");
    expect(applied.points).toBe(6);
    expect(applied.data?.["note"]).toBe("x");
    expect((applied.source as Record<string, unknown>)["imported_as"]).toBe("Visão Aguçada");
  });
});

describe("reconcileEntries", () => {
  const index = catalogueIndex(buildCatalogue(rows, ["Core"]));

  it("silently keeps entries it cannot place", () => {
    const result = reconcileEntries(
      [
        entry({ kind: "advantage", name: "Combat Reflexes", points: 15 }),
        entry({ kind: "advantage", name: "Totally Unknown", points: 7 }),
        entry({ kind: "equipment", name: "Rope", points: 0 }),
      ],
      index,
    );
    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(1);
    expect(result.entries[1]!.name).toBe("Totally Unknown");
    expect(result.entries[1]!.points).toBe(7);
  });

  it("applies AI matches on top of the deterministic pass", () => {
    const ai = resolveMatches(
      [{ source: "Reflexos de Combate", kind: "advantage", match: "Combat Reflexes" }],
      index,
    );
    const result = reconcileEntries(
      [entry({ kind: "advantage", name: "Reflexos de Combate", points: 0 })],
      index,
      ai,
    );
    expect(result.entries[0]!.name).toBe("Combat Reflexes");
    expect(result.matched).toBe(1);
  });
});
