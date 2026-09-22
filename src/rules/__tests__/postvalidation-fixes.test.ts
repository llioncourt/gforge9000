/**
 * Regression tests for the post-validation corrections (REQ-FIX-001..006).
 *
 * Each block states the rule it protects:
 *  - 001 campaign-package import keeps provenance and the pack link
 *  - 002 a negative quirk limit is compared by magnitude
 *  - 003 gear mechanics are part of the canonical pack definition
 *  - 004 "removed" is derived when the caller owns the pack, else inaccessible
 *  - 005 pack search ignores accents
 *  - 006 the picker obeys the campaign allow list
 */

import { describe, expect, it } from "vitest";

import {
  compareDefinition,
  hashDefinition,
  packDefinition,
  restoreDefinitionPatch,
  withPackLink,
  type PackItemLike,
  type PackLink,
} from "@/lib/pack-link";
import { deriveStatuses, type EntryRowLike } from "@/lib/pack-link-service";
import { loadPackCandidates, type PackClient } from "@/lib/pack-match";
import { pickerPacks } from "@/lib/packs";
import { validateCharacter } from "@/lib/pack-validation";
import { applyCatalogue, type CatalogueEntry, type ImportedEntry } from "@/lib/trait-match";
import { reconcileEntriesWithClient } from "@/lib/trait-reconcile-core";
import type { CharacterEntry, CharacterRecord } from "@/rules";

/* ------------------------------------------------------------------ */
/* A tiny chainable stand-in for the RLS-scoped client                 */
/* ------------------------------------------------------------------ */

type Rows = Record<string, Record<string, unknown>[]>;

function fakeClient(tables: Rows): PackClient {
  const builder = (rows: Record<string, unknown>[]) => {
    const self: Record<string, unknown> = {};
    for (const method of ["select", "order", "limit", "eq", "in", "range"]) {
      self[method] = () => self;
    }
    self["then"] = (resolve: (value: { data: unknown; error: null }) => unknown) =>
      resolve({ data: rows, error: null });
    return self;
  };
  return {
    from: (table: string) => builder(tables[table] ?? []),
  } as unknown as PackClient;
}

/* ------------------------------------------------------------------ */
/* REQ-FIX-001 — import keeps provenance and the link                  */
/* ------------------------------------------------------------------ */

const link: PackLink = {
  pack_id: "pack-1",
  pack_name: "Core",
  pack_entry_id: "item-1",
  pack_version: "v1:sha256:aaaa",
  linked_at: "2026-01-01T00:00:00.000Z",
  link_method: "ui_picker",
};

describe("imported character entries keep their provenance", () => {
  const catalogueRow: CatalogueEntry = {
    kind: "skill",
    name: "Stealth",
    category: "Combat",
    base_points: 1,
    cost_per_level: 0,
    summary: null,
    data: { attribute: "DX", difficulty: "A" },
    pack: "Core",
    source_label: "Core Book",
    source_edition: "4e",
    source_page: "B222",
    source_type: "book",
  };

  const imported: ImportedEntry = {
    kind: "skill",
    name: "Stealth",
    points: 2,
    levels: 1,
    data: {},
    source: withPackLink(
      { label: "Core Book", edition: "4e", page: "B222", type: "book", pack: "Core" },
      link,
    ),
  };

  it("keeps the pack link when an entry is rewritten onto library content", () => {
    const applied = applyCatalogue(imported, catalogueRow);
    expect((applied.source as Record<string, unknown>)["link"]).toMatchObject({
      pack_entry_id: "item-1",
      link_method: "ui_picker",
    });
    expect((applied.source as Record<string, unknown>)["pack"]).toBe("Core");
  });

  it("reconciles against the caller's library and never blanks the source", async () => {
    const client = fakeClient({
      library_entries: [catalogueRow as unknown as Record<string, unknown>],
    });
    const result = await reconcileEntriesWithClient(client, [imported], []);
    expect(result.matched).toBe(1);
    const entry = result.entries[0]!;
    expect(entry.source).toBeTruthy();
    expect((entry.source as Record<string, unknown>)["link"]).toMatchObject({
      pack_entry_id: "item-1",
    });
  });

  it("keeps entries exactly as imported when the library has nothing to match", async () => {
    const result = await reconcileEntriesWithClient(fakeClient({}), [imported], []);
    expect(result.matched).toBe(0);
    expect(result.entries[0]!.source).toEqual(imported.source);
  });

  it("is idempotent: reconciling twice produces the same rows", async () => {
    const client = fakeClient({
      library_entries: [catalogueRow as unknown as Record<string, unknown>],
    });
    const once = await reconcileEntriesWithClient(client, [imported], []);
    const twice = await reconcileEntriesWithClient(client, once.entries, []);
    expect(twice.entries).toEqual(once.entries);
  });
});

/* ------------------------------------------------------------------ */
/* REQ-FIX-002 — negative quirk limits                                 */
/* ------------------------------------------------------------------ */

describe("quirk limit with negative campaign settings", () => {
  const character = {
    id: "char-1",
    name: "Vale",
    point_budget: 500,
    tech_level: 8,
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
  } as unknown as CharacterRecord;

  const quirks = (count: number): CharacterEntry[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `q${i}`,
      kind: "quirk",
      name: `Quirk ${i}`,
      category: null,
      points: -1,
      levels: 1,
      data: {},
    })) as unknown as CharacterEntry[];

  const report = (count: number) =>
    validateCharacter({
      character,
      entries: quirks(count),
      statuses: new Map(),
      campaignSettings: { quirk_limit: -5 },
    });

  it("accepts a total inside the limit", () => {
    expect(report(4).points.quirks).toBe(-4);
    expect(report(4).findings.some((f) => f.type === "quirk_limit")).toBe(false);
  });

  it("accepts a total exactly at the limit", () => {
    expect(report(5).findings.some((f) => f.type === "quirk_limit")).toBe(false);
  });

  it("rejects a total beyond the limit", () => {
    expect(report(6).findings.some((f) => f.type === "quirk_limit")).toBe(true);
  });

  it("still works for a legacy positive limit", () => {
    const positive = (count: number) =>
      validateCharacter({
        character,
        entries: quirks(count),
        statuses: new Map(),
        campaignSettings: { quirk_limit: 5 },
      }).findings.some((f) => f.type === "quirk_limit");
    expect(positive(5)).toBe(false);
    expect(positive(6)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* REQ-FIX-003 — gear mechanics belong to the definition               */
/* ------------------------------------------------------------------ */

describe("equipment definition, diff and restore", () => {
  const gear: PackItemLike = {
    kind: "equipment",
    name: "Mail Hauberk",
    category: "Armour",
    base_points: 0,
    cost_per_level: 0,
    max_levels: null,
    data: {
      weight: 25,
      cost: 230,
      dr: 4,
      locations: ["torso", "arms"],
      tl: 3,
      legality: "LC4",
      container: "Backpack",
      weapons: [{ mode: "swing", damage: "sw+1", reach: "1" }],
    },
  };

  const version = (item: PackItemLike) => hashDefinition(packDefinition(item));
  const changed = (patch: Record<string, unknown>): PackItemLike => ({
    ...gear,
    data: { ...gear.data, ...patch },
  });

  it("changes the version when any mechanical stat changes", async () => {
    const base = await version(gear);
    for (const patch of [
      { weight: 26 },
      { cost: 240 },
      { dr: 5 },
      { locations: ["torso"] },
      { tl: 4 },
      { legality: "LC3" },
      { container: "Cart" },
      { weapons: [{ mode: "thrust", damage: "thr", reach: "1" }] },
    ]) {
      expect(await version(changed(patch))).not.toBe(base);
    }
  });

  it("ignores quantity, carried and editorial text", async () => {
    const base = await version(gear);
    expect(await version(changed({ quantity: 3, carried: false, notes: "shiny" }))).toBe(base);
  });

  it("reports a modified entry when gear stats drift from the pack", () => {
    const entry = {
      kind: "equipment",
      name: "Mail Hauberk",
      category: "Armour",
      points: 0,
      levels: 1,
      data: { ...gear.data, dr: 2, quantity: 2, carried: false },
    };
    const diff = compareDefinition(entry, gear);
    expect(diff.map((d) => d.field)).toEqual(["dr"]);
  });

  it("restores pack stats while keeping quantity and carried", () => {
    const entry = {
      kind: "equipment",
      name: "Mail Hauberk",
      category: "Armour",
      points: 0,
      levels: 1,
      data: { weight: 1, dr: 0, quantity: 3, carried: false },
    };
    const patch = restoreDefinitionPatch(entry, gear);
    expect(patch.data["weight"]).toBe(25);
    expect(patch.data["dr"]).toBe(4);
    expect(patch.data["weapons"]).toEqual(gear.data!["weapons"]);
    expect(patch.data["quantity"]).toBe(3);
    expect(patch.data["carried"]).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* REQ-FIX-004 — removed vs inaccessible through the shared derivation */
/* ------------------------------------------------------------------ */

describe("derived state for a link whose item is gone", () => {
  const entry: EntryRowLike = {
    id: "entry-1",
    kind: "skill",
    name: "Stealth",
    category: null,
    points: 2,
    levels: 1,
    data: {},
    source: withPackLink({}, link),
  } as unknown as EntryRowLike;

  const client = fakeClient({
    content_packs: [{ id: "pack-1", owner_id: "user-1", name: "Core" }],
    library_entries: [],
  });

  it("proves removal when the caller owns the pack", async () => {
    const statuses = await deriveStatuses(client, [entry], undefined, "user-1");
    expect(statuses.get("entry-1")?.stale_reason).toBe("removed");
  });

  it("stays conservative for someone else's pack", async () => {
    const statuses = await deriveStatuses(client, [entry], undefined, null);
    expect(statuses.get("entry-1")?.stale_reason).toBe("inaccessible");
  });
});

/* ------------------------------------------------------------------ */
/* REQ-FIX-005 — accent-insensitive pack search                        */
/* ------------------------------------------------------------------ */

describe("pack search ignores accents", () => {
  const client = fakeClient({
    content_packs: [{ id: "pack-1", owner_id: "user-1", name: "Core" }],
    library_entries: [
      {
        id: "item-1",
        owner_id: "user-1",
        kind: "skill",
        name: "Sobrevivência",
        category: null,
        base_points: 1,
        cost_per_level: 0,
        max_levels: null,
        pack: "Core",
        data: {},
      },
      {
        id: "item-2",
        owner_id: "user-1",
        kind: "skill",
        name: "Stealth",
        category: null,
        base_points: 1,
        cost_per_level: 0,
        max_levels: null,
        pack: "Core",
        data: {},
      },
    ],
  });

  it("finds an accented name from an unaccented query", async () => {
    const found = await loadPackCandidates(client, { search: "sobrevivencia" });
    expect(found.map((c) => c.name)).toEqual(["Sobrevivência"]);
  });

  it("finds it from the accented query too", async () => {
    const found = await loadPackCandidates(client, { search: "Sobrevivência" });
    expect(found.map((c) => c.name)).toEqual(["Sobrevivência"]);
  });
});

/* ------------------------------------------------------------------ */
/* REQ-FIX-006 — picker obeys the campaign allow list                  */
/* ------------------------------------------------------------------ */

describe("packs offered by the picker", () => {
  it("offers every accessible pack when the campaign lists none", () => {
    expect(pickerPacks(["Homebrew"], { allowed_packs: [] }, true)).toBeNull();
    expect(pickerPacks([], {}, true)).toBeNull();
  });

  it("offers only the whitelisted packs inside a campaign", () => {
    expect(pickerPacks([], { allowed_packs: ["Core"] }, true)).toEqual(["Core"]);
  });

  it("does not let a character's own packs bypass the whitelist", () => {
    expect(pickerPacks(["Third Party", "core"], { allowed_packs: ["Core"] }, true)).toEqual([
      "Core",
    ]);
  });

  it("keeps using the character's packs outside a campaign", () => {
    expect(pickerPacks(["Homebrew", "Homebrew"], undefined, false)).toEqual(["Homebrew"]);
  });
});
