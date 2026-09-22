import { describe, expect, it } from "vitest";
import {
  asSourceBag,
  compareDefinition,
  countStates,
  derivePackLinkState,
  expectedLeveledCost,
  hashDefinition,
  leveledPricing,
  packDefinition,
  packLeveledCost,
  packVersionOf,
  readPackLink,
  restoreDefinitionPatch,
  specializationOf,
  withPackLink,
  withoutPackLink,
  type CharacterEntryLike,
  type PackItemLike,
  type PackLink,
} from "@/lib/pack-link";
import {
  matchPackCandidates,
  parseSearchName,
  type PackCandidate,
} from "@/lib/pack-match";
import { validateCharacter } from "@/lib/pack-validation";
import type { CharacterEntry, CharacterRecord } from "@/rules";

const link: PackLink = {
  pack_id: "pack-1",
  pack_name: "Basic",
  pack_entry_id: "item-1",
  pack_version: "v1:sha256:abc",
  linked_at: "2026-01-01T00:00:00.000Z",
  link_method: "manual",
};

function item(over: Partial<PackItemLike> = {}): PackItemLike {
  return {
    kind: "trait",
    name: "Acute Vision",
    category: "Physical",
    base_points: 2,
    cost_per_level: 2,
    max_levels: 5,
    data: {},
    ...over,
  };
}

function entry(over: Partial<CharacterEntryLike> = {}): CharacterEntryLike {
  return {
    kind: "trait",
    name: "Acute Vision",
    category: "Physical",
    points: 2,
    levels: 1,
    data: {},
    source: withPackLink({ label: "Manual", page: "35" }, link),
    ...over,
  } as CharacterEntryLike;
}

function candidate(over: Partial<PackCandidate> = {}): PackCandidate {
  return {
    id: "item-1",
    kind: "skill",
    name: "Survival",
    category: null,
    base_points: 1,
    cost_per_level: 0,
    max_levels: null,
    difficulty: "A",
    attribute: "Per",
    defaults: null,
    prerequisites: null,
    specialization: null,
    specialization_required: false,
    pack: "Basic",
    pack_id: "pack-1",
    pack_name: "Basic",
    data: {},
    ...over,
  };
}

describe("pack link: provenance is never lost", () => {
  it("keeps every other source key when linking", () => {
    const source = { label: "Manual", edition: "4e", page: "35", imported_as: "Visão Aguçada" };
    const linked = withPackLink(source, link);
    expect(linked).toMatchObject(source);
    expect(readPackLink(linked)).toEqual(link);
  });

  it("removes only the link when unlinking", () => {
    const linked = withPackLink({ label: "Manual", page: "35" }, link);
    const bare = withoutPackLink(linked);
    expect(bare).toEqual({ label: "Manual", page: "35" });
    expect(readPackLink(bare)).toBeNull();
  });

  it("treats an entry with no link as custom, even with provenance", () => {
    expect(readPackLink({ label: "Manual" })).toBeNull();
    expect(derivePackLinkState(entry({ source: { label: "Manual" } }), null).state).toBe("custom");
  });

  it("ignores a malformed link record", () => {
    expect(readPackLink({ link: { pack_id: "x" } })).toBeNull();
    expect(asSourceBag(null)).toEqual({});
  });
});

describe("pack link: canonical hashing", () => {
  it("is stable regardless of key order and prefixed v1:sha256", async () => {
    const a = await packVersionOf(item());
    const b = await hashDefinition(packDefinition(item()));
    expect(a).toBe(b);
    expect(a).toMatch(/^v1:sha256:[0-9a-f]{64}$/);
  });

  it("changes when a mechanically relevant field changes", async () => {
    const before = await packVersionOf(item());
    expect(await packVersionOf(item({ base_points: 3 }))).not.toBe(before);
    expect(await packVersionOf(item({ max_levels: 9 }))).not.toBe(before);
  });

  it("does not change for fields outside the definition", async () => {
    const before = await packVersionOf(item());
    expect(await packVersionOf(item({ data: { notes: "flavour text" } }))).toBe(before);
  });
});

describe("pack link: derived state", () => {
  const resolution = (over = {}) => ({
    item: item(),
    currentVersion: link.pack_version,
    packAllowed: true,
    ...over,
  });

  it("is official when nothing diverges", () => {
    expect(derivePackLinkState(entry(), resolution()).state).toBe("official");
  });

  it("is modified when a definition field diverges", () => {
    const status = derivePackLinkState(entry({ category: "Mental" }), resolution());
    expect(status.state).toBe("modified");
    expect(status.diff?.map((d) => d.field)).toContain("category");
  });

  it("is stale with a reason for each unavailability", () => {
    expect(
      derivePackLinkState(entry(), { item: null, packAllowed: true, missingReason: "removed" })
        .stale_reason,
    ).toBe("removed");
    expect(
      derivePackLinkState(entry(), { item: null, packAllowed: true, missingReason: "inaccessible" })
        .stale_reason,
    ).toBe("inaccessible");
    expect(
      derivePackLinkState(entry(), resolution({ packAllowed: false })).stale_reason,
    ).toBe("pack_not_allowed");
    expect(
      derivePackLinkState(entry(), resolution({ currentVersion: "v1:sha256:other" })).stale_reason,
    ).toBe("version_changed");
  });

  it("counts states for a summary", () => {
    expect(
      countStates([{ state: "official" }, { state: "official" }, { state: "stale" }]),
    ).toEqual({ official: 2, modified: 0, custom: 0, stale: 1 });
  });
});

describe("pack link: definition versus progression", () => {
  it("does not call invested skill points a modification", () => {
    const skill = entry({ kind: "skill", name: "Stealth", points: 8, data: { difficulty: "A" } });
    const packSkill = item({ kind: "skill", name: "Stealth", base_points: 1, cost_per_level: 0, category: "Physical", data: { difficulty: "A" } });
    expect(compareDefinition(skill, packSkill)).toEqual([]);
  });

  it("prices a leveled advantage from base plus per-level cost", () => {
    expect(expectedLeveledCost(2, 2, 3)).toBe(6);
    const priced = leveledPricing(entry({ levels: 3, points: 6 }), item());
    expect(priced).toMatchObject({ expected: 6, actual: 6, consistent: true });
    expect(leveledPricing(entry({ levels: 3, points: 5 }), item())?.consistent).toBe(false);
  });

  it("flags levels beyond the pack maximum", () => {
    const diff = compareDefinition(entry({ levels: 9, points: 18 }), item());
    expect(diff.map((d) => d.field)).toContain("max_levels");
  });
});

describe("pack link: specialization", () => {
  it("prefers the structural field and falls back to the name", () => {
    expect(specializationOf({ name: "Survival", data: { specialization: "Jungle" } })).toBe("Jungle");
    expect(specializationOf({ name: "Survival (Jungle)" })).toBe("Jungle");
    expect(specializationOf({ name: "Stealth" })).toBe("");
  });

  it("does not read a self-control number as a specialization", () => {
    expect(parseSearchName("Bad Temper (12)").rawQualifier).toBe("");
    expect(parseSearchName("Acute Vision +2").base).toBe(parseSearchName("Acute Vision").base);
  });
});

describe("pack link: matching", () => {
  it("matches a specialization-capable base item and keeps the typed specialization", () => {
    const result = matchPackCandidates({ kind: "skill", name: "Survival (Jungle)" }, [
      candidate({ specialization_required: true }),
    ]);
    expect(result.status).toBe("unique");
    expect(result.specialization).toBe("Jungle");
  });

  it("never attaches a specialization to a plain generic item", () => {
    // The pack says nothing about specializations, so "Survival (Jungle)" is
    // not the same thing as the generic "Survival": report no match.
    const result = matchPackCandidates({ kind: "skill", name: "Survival (Jungle)" }, [candidate()]);
    expect(result.status).toBe("none");
    expect(result.item).toBeNull();
  });

  it("prefers the exact specialization over the base item", () => {
    const result = matchPackCandidates({ kind: "skill", name: "Survival (Jungle)" }, [
      candidate(),
      candidate({ id: "item-2", name: "Survival (Jungle)", specialization: "Jungle" }),
    ]);
    expect(result.item?.id).toBe("item-2");
  });

  it("reports ambiguity instead of guessing, and writes nothing", () => {
    const result = matchPackCandidates({ kind: "skill", name: "Survival" }, [
      candidate({ id: "a", name: "Survival (Jungle)", specialization: "Jungle" }),
      candidate({ id: "b", name: "Survival (Desert)", specialization: "Desert" }),
    ]);
    expect(result.status).toBe("ambiguous");
    expect(result.item).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("uses the category only to break a tie", () => {
    const result = matchPackCandidates({ kind: "skill", name: "Survival", category: "Outdoor" }, [
      candidate({ id: "a", category: "Outdoor" }),
      candidate({ id: "b", category: "Social" }),
    ]);
    expect(result.item?.id).toBe("a");
  });

  it("reports no match across kinds", () => {
    expect(matchPackCandidates({ kind: "trait", name: "Survival" }, [candidate()]).status).toBe("none");
  });
});

describe("pack link: restoring", () => {
  it("takes definition fields from the pack and keeps progression", () => {
    const skill = entry({
      kind: "skill",
      name: "Survival (Jungle)",
      points: 8,
      data: { specialization: "Jungle", difficulty: "A" },
    });
    const patch = restoreDefinitionPatch(
      skill,
      item({ kind: "skill", name: "Survival", category: "Outdoor", base_points: 1, cost_per_level: 0, data: { difficulty: "H", attribute: "Per" } }),
    );
    expect(patch.points).toBe(8);
    expect(patch.name).toBe("Survival (Jungle)");
    expect(patch.category).toBe("Outdoor");
    expect(patch.data["difficulty"]).toBe("H");
    expect(patch.data["specialization"]).toBe("Jungle");
  });

  it("reprices a leveled advantage while keeping the chosen levels", () => {
    const patch = restoreDefinitionPatch(entry({ levels: 3, points: 99 }), item());
    expect(patch.levels).toBe(3);
    expect(patch.points).toBe(6);
  });

  it("keeps levels above the pack maximum and warns instead of clamping", () => {
    const patch = restoreDefinitionPatch(entry({ levels: 12 }), item());
    expect(patch.levels).toBe(12);
    expect(patch.warnings.map((w) => w.code)).toContain("levels_over_max");
  });

  it("refreshes pack-defined mechanics and drops an outdated copy on the sheet", () => {
    const patch = restoreDefinitionPatch(
      entry({
        kind: "skill",
        name: "Stealth",
        data: { defaults: "DX-5", difficulty: "E", attribute: "IQ" },
      }),
      item({ kind: "skill", name: "Stealth", data: { difficulty: "A", attribute: "DX" } }),
    );
    expect(patch.data["difficulty"]).toBe("A");
    expect(patch.data["attribute"]).toBe("DX");
    // The pack no longer defines defaults, so the stale sheet copy goes away.
    expect(patch.data["defaults"]).toBeUndefined();
  });
});

describe("character validation", () => {
  const character: CharacterRecord = {
    id: "char-1",
    name: "Brann",
    point_budget: 100,
    tech_level: 3,
    st: 10,
    dx: 10,
    iq: 10,
    ht: 10,
    hp_delta: 0,
    will_delta: 0,
    per_delta: 0,
    fp_delta: 0,
    speed_delta: 0,
    move_delta: 0,
    conditions: [],
    wealth: "average",
    status: 0,
  };

  const sheetEntry = (over: Partial<CharacterEntry> = {}): CharacterEntry =>
    ({
      id: "e1",
      kind: "trait",
      name: "Acute Vision",
      category: "Physical",
      points: 2,
      levels: 1,
      data: {},
      source: withPackLink({}, link),
      ...over,
    }) as CharacterEntry;

  it("buckets entries by their pack state and reports findings", () => {
    const e1 = sheetEntry();
    const e2 = sheetEntry({ id: "e2", name: "Homemade", source: {} });
    const result = validateCharacter({
      character,
      entries: [e1, e2],
      statuses: new Map([
        ["e1", { state: "stale" as const, link, stale_reason: "removed" as const }],
        ["e2", { state: "custom" as const, link: null }],
      ]),
    });
    expect(result.pack_states).toMatchObject({ stale: 1, custom: 1 });
    expect(result.entries.custom.map((e) => e.id)).toEqual(["e2"]);
    expect(result.findings.some((f) => f.type === "stale_link")).toBe(true);
  });

  it("reports a stated level that disagrees with the engine separately", () => {
    const skill = sheetEntry({
      id: "s1",
      kind: "skill",
      name: "Stealth",
      points: 1,
      data: { attribute: "DX", difficulty: "A", level: 99 },
    });
    const result = validateCharacter({
      character,
      entries: [skill],
      statuses: new Map([["s1", { state: "custom" as const, link: null }]]),
    });
    expect(result.skills[0]?.stated_level).toBe(99);
    expect(result.skills[0]?.stated_level_matches).toBe(false);
    expect(result.findings.some((f) => f.type === "stated_level_mismatch")).toBe(true);
  });

  it("flags going over the point budget", () => {
    const big = sheetEntry({ id: "b1", points: 500, source: {} });
    const result = validateCharacter({
      character,
      entries: [big],
      statuses: new Map([["b1", { state: "custom" as const, link: null }]]),
    });
    expect(result.points.over_budget).toBe(true);
    expect(result.findings.some((f) => f.type === "point_budget")).toBe(true);
  });
});

describe("pack link: leveled pricing (pack-link contract)", () => {
  // A per-level pack row prices EVERY level, including the first: most real
  // rows carry base_points = 0 with cost_per_level = 5.
  it("prices two levels of a 5/level trait at 10", () => {
    expect(packLeveledCost(5, 2)).toBe(10);
    const perLevel = item({ base_points: 0, cost_per_level: 5, max_levels: 10 });
    expect(leveledPricing(entry({ levels: 2, points: 5 }), perLevel)).toMatchObject({
      expected: 10,
      actual: 5,
      consistent: false,
    });
    expect(leveledPricing(entry({ levels: 2, points: 10 }), perLevel)?.consistent).toBe(true);
  });
});
