import { describe, expect, it } from "vitest";
import { computePoints } from "@/rules/points";
import type { CharacterRecord } from "@/rules/types";
import {
  TRAIT_POINTS_SEMANTICS_KEY,
  perLevelPoints,
  storedPointsForPerLevel,
  toTotalSemantics,
  traitBaseCost,
  traitPointsSemantics,
  usesLeveledPoints,
} from "@/rules/trait-cost";
import {
  fillMissingDefinition,
  restoreDefinitionPatch,
  derivePackLinkState,
} from "@/lib/pack-link";
import type { CharacterEntry } from "@/rules/types";

function entry(partial: Partial<CharacterEntry>): CharacterEntry {
  return {
    id: partial.id ?? "e1",
    kind: partial.kind ?? "advantage",
    name: partial.name ?? "Destemor",
    category: partial.category ?? null,
    points: partial.points ?? 0,
    levels: partial.levels ?? 1,
    notes: partial.notes ?? null,
    data: partial.data ?? {},
    source: partial.source ?? null,
    sort_order: partial.sort_order ?? 0,
  } as CharacterEntry;
}

const CHAR = {
  id: "c1",
  name: "Teste",
  st: 10,
  dx: 10,
  iq: 10,
  ht: 10,
  point_total: 100,
  data: {},
} as unknown as CharacterRecord;

const LINK = {
  pack_entry_id: "p1",
  pack_id: "pack1",
  pack_name: "Pack",
  pack_version: "v1:sha256:x",
  linked_at: "2026-01-01T00:00:00.000Z",
  link_method: "manual",
};

const packItem = {
  id: "p1",
  kind: "advantage",
  name: "Destemor",
  category: "Mental",
  base_points: 2,
  cost_per_level: 2,
  max_levels: 4,
  data: {},
};

describe("leveled trait cost semantics", () => {
  it("A. legacy unlinked per-level row (points=2, levels=2) still costs 4", () => {
    const row = entry({ points: 2, levels: 2 });
    expect(traitPointsSemantics(row)).toBe("per_level");
    expect(traitBaseCost(row)).toBe(4);
    expect(computePoints(CHAR, [row]).advantages).toBe(4);
  });

  it("B. an OLD linked but unmarked row keeps its legacy effective cost", () => {
    const row = entry({
      points: 2,
      levels: 2,
      source: { link: LINK } as never,
    });
    expect(traitBaseCost(row)).toBe(4);
  });

  it("C. a normalised total-semantics row is never multiplied again", () => {
    const row = entry({
      points: 4,
      levels: 2,
      data: { [TRAIT_POINTS_SEMANTICS_KEY]: "total" },
    });
    expect(traitBaseCost(row)).toBe(4);
    expect(computePoints(CHAR, [row]).advantages).toBe(4);
  });

  it("D. restore writes the canonical total plus the marker", () => {
    const patch = restoreDefinitionPatch(entry({ points: 2, levels: 2 }), packItem);
    expect(patch.points).toBe(4);
    expect(patch.data[TRAIT_POINTS_SEMANTICS_KEY]).toBe("total");
    const restored = entry({ points: patch.points ?? 0, levels: patch.levels, data: patch.data });
    expect(traitBaseCost(restored)).toBe(4);
  });

  it("E. linking a legacy row converts storage without changing the cost", () => {
    const legacy = entry({ points: 2, levels: 2 });
    expect(traitBaseCost(legacy)).toBe(4);
    const fill = fillMissingDefinition(legacy, packItem);
    expect(fill.points).toBe(4);
    expect(fill.data[TRAIT_POINTS_SEMANTICS_KEY]).toBe("total");
    const linked = entry({ points: fill.points ?? 0, levels: 2, data: fill.data });
    expect(traitBaseCost(linked)).toBe(4);
  });

  it("F. the restored entry is Official and still costs 4", () => {
    const patch = restoreDefinitionPatch(entry({ points: 2, levels: 2 }), packItem);
    const restored = entry({
      points: patch.points ?? 0,
      levels: patch.levels,
      category: patch.category,
      name: patch.name,
      data: patch.data,
      source: { link: LINK } as never,
    });
    const status = derivePackLinkState(restored, {
      item: packItem,
      currentVersion: "v1:sha256:x",
      packAllowed: true,
    });
    expect(status.state).toBe("official");
    expect(computePoints(CHAR, [restored]).advantages).toBe(4);
  });

  it("G. non-leveled traits are unaffected", () => {
    const perk = entry({ kind: "perk", points: 1, levels: 1 });
    expect(traitBaseCost(perk)).toBe(1);
    expect(toTotalSemantics(perk).points).toBe(1);
  });

  it("H. skill-like kinds and equipment never use leveled multiplication", () => {
    expect(usesLeveledPoints("skill")).toBe(false);
    expect(usesLeveledPoints("technique")).toBe(false);
    expect(usesLeveledPoints("spell")).toBe(false);
    expect(usesLeveledPoints("equipment")).toBe(false);
    expect(usesLeveledPoints("advantage")).toBe(true);
    const skill = entry({ kind: "skill", points: 4, levels: 2, data: { points: 4 } });
    expect(computePoints(CHAR, [skill]).skills).toBe(4);
  });
});

describe("linking fills only MISSING definition fields", () => {
  const skillItem = {
    id: "s1",
    kind: "skill",
    name: "Sobrevivência",
    category: "Exploração",
    base_points: 1,
    cost_per_level: 0,
    max_levels: null,
    data: { attribute: "PER", difficulty: "A", defaults: "PER-5" },
  };

  it("fills a missing attribute and difficulty", () => {
    const row = entry({ kind: "skill", name: "Sobrevivência", points: 4, data: { points: 4 } });
    const fill = fillMissingDefinition(row, skillItem);
    expect(fill.changed).toBe(true);
    expect(fill.data["attribute"]).toBe("PER");
    expect(fill.data["difficulty"]).toBe("A");
    expect(fill.data["points"]).toBe(4);
    expect(fill.category).toBe("Exploração");
    expect(fill.points).toBeUndefined();
  });

  it("never overwrites a deliberate sheet value", () => {
    const row = entry({
      kind: "skill",
      name: "Sobrevivência",
      category: "Minha categoria",
      points: 4,
      data: { points: 4, attribute: "IQ", difficulty: "A" },
    });
    const fill = fillMissingDefinition(row, skillItem);
    expect(fill.data["attribute"]).toBe("IQ");
    expect(fill.category).toBeUndefined();
  });

  it("preserves the player's specialization and invested points", () => {
    const row = entry({
      kind: "skill",
      name: "Sobrevivência (Deserto)",
      points: 8,
      data: { points: 8, specialization: "Deserto" },
    });
    const fill = fillMissingDefinition(row, skillItem);
    expect(fill.data["specialization"]).toBe("Deserto");
    expect(fill.data["points"]).toBe(8);
  });

  it("fills missing equipment stats but keeps existing ones", () => {
    const gearItem = {
      id: "g1",
      kind: "equipment",
      name: "Colete",
      category: null,
      base_points: 0,
      cost_per_level: 0,
      max_levels: null,
      data: { dr: 5, weight: 3, cost: 100 },
    };
    const row = entry({ kind: "equipment", name: "Colete", points: 0, data: { weight: 9 } });
    const fill = fillMissingDefinition(row, gearItem);
    expect(fill.data["dr"]).toBe(5);
    expect(fill.data["weight"]).toBe(9);
    expect(fill.data["cost"]).toBe(100);
  });
});

describe("leveled trait editor semantics (pack-linked rows)", () => {
  it("G. a pack-linked leveled row shows the per-level figure, not the stored total", () => {
    const row = entry({
      points: 6,
      levels: 3,
      data: { [TRAIT_POINTS_SEMANTICS_KEY]: "total" },
    });
    expect(perLevelPoints(row)).toBe(2);
  });

  it("H. raising levels on a pack-linked row multiplies the charged cost again", () => {
    const row = entry({
      points: 2,
      levels: 1,
      data: { [TRAIT_POINTS_SEMANTICS_KEY]: "total" },
    });
    // Player edits levels 1 -> 3 keeping 2 pts/level.
    const stored = storedPointsForPerLevel({ ...row, levels: 3 }, perLevelPoints(row), 3);
    const edited = entry({ points: stored, levels: 3, data: row.data });
    expect(stored).toBe(6);
    expect(traitBaseCost(edited)).toBe(6);
    expect(computePoints(CHAR, [edited]).advantages).toBe(6);
  });

  it("I. editing the per-level figure on a pack-linked row stores the total", () => {
    const row = entry({
      points: 4,
      levels: 2,
      data: { [TRAIT_POINTS_SEMANTICS_KEY]: "total" },
    });
    const stored = storedPointsForPerLevel(row, 3);
    expect(stored).toBe(6);
    expect(traitBaseCost(entry({ points: stored, levels: 2, data: row.data }))).toBe(6);
  });

  it("J. legacy unmarked rows keep per-level storage unchanged by the helpers", () => {
    const row = entry({ points: 2, levels: 2 });
    expect(perLevelPoints(row)).toBe(2);
    expect(storedPointsForPerLevel(row, 5)).toBe(5);
    expect(storedPointsForPerLevel({ ...row, levels: 4 }, 2, 4)).toBe(2);
    expect(traitBaseCost(entry({ points: 2, levels: 4 }))).toBe(8);
  });

  it("K. invalid level input on a marked row stores the bare per-level figure", () => {
    const row = entry({
      points: 2,
      levels: 1,
      data: { [TRAIT_POINTS_SEMANTICS_KEY]: "total" },
    });
    expect(storedPointsForPerLevel(row, 2, Number("abc"))).toBe(2);
    expect(storedPointsForPerLevel(row, 2, 0)).toBe(2);
  });
});
