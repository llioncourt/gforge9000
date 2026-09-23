/**
 * P0-01 regressions: invested points on skill-like entries must have ONE
 * effective value, shared by the rules engine, the sheet UI, the MCP write
 * paths and pack restore. See `src/rules/skill-points.ts` for the rule table.
 */
import { describe, expect, it } from "vitest";
import {
  buildSheet,
  computePoints,
  defaultRuleset,
  deriveStats,
  investedPoints,
  skillLevel,
  syncInvestedPoints,
} from "@/rules";
import type { CharacterEntry, CharacterRecord } from "@/rules";
import { restoreDefinitionPatch } from "@/lib/pack-link";
import { libraryEntryToCharacterDraft } from "@/lib/portable";
import { emptyDraft, toDraft } from "@/components/character/entry-dialog";
import { buildMcpServer } from "@/lib/mcp/tools.server";

const USER = "00000000-0000-0000-0000-000000000001";
const CHARACTER_ID = "33333333-3333-4333-8333-333333333333";
const ENTRY_ID = "44444444-4444-4444-8444-444444444444";

const character: CharacterRecord = {
  id: CHARACTER_ID,
  name: "Brann",
  st: 10,
  dx: 12,
  iq: 10,
  ht: 10,
  will_mod: 0,
  per_mod: 0,
  hp_mod: 0,
  fp_mod: 0,
  speed_mod: 0,
  move_mod: 0,
  sm: 0,
  tech_level: 8,
  point_budget: 150,
  current_hp: 10,
  current_fp: 10,
} as unknown as CharacterRecord;

function entry(over: Partial<CharacterEntry>): CharacterEntry {
  return {
    id: ENTRY_ID,
    character_id: CHARACTER_ID,
    kind: "skill",
    name: "Broadsword",
    category: null,
    points: 0,
    levels: 1,
    notes: null,
    sort_order: 0,
    data: { attribute: "DX", difficulty: "A" },
    source: {},
    ...over,
  } as unknown as CharacterEntry;
}

const PACK_LINK = { source: { label: "Pack", link: { entry_id: "pack-1", pack: "core" } } };

describe("A — legacy unlinked sheets keep their effective value", () => {
  it("uses data.points when the top-level column is a stale 0", () => {
    const e = entry({ points: 0, data: { attribute: "DX", difficulty: "A", points: 8 } });
    expect(investedPoints(e)).toBe(8);
    expect(computePoints(character, [e], defaultRuleset).skills).toBe(8);
  });
});

describe("B — a linked entry trusts the top-level column", () => {
  const e = entry({
    points: 12,
    data: { attribute: "DX", difficulty: "A", points: 8 },
    ...PACK_LINK,
  });

  it("resolves to the MCP-written value, not the stale shadow", () => {
    expect(investedPoints(e)).toBe(12);
  });

  it("uses it for the point total and the skill level alike", () => {
    expect(computePoints(character, [e], defaultRuleset).skills).toBe(12);
    const stats = deriveStats(character, defaultRuleset);
    // 12 points on an Average skill => DX+3 relative level.
    expect(skillLevel(e, stats, defaultRuleset).relative).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/* MCP write paths                                                     */
/* ------------------------------------------------------------------ */

type Spy = { inserted?: unknown; updated?: unknown };

function query(data: unknown, spy: Spy) {
  const self: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "single", "maybeSingle", "in", "delete"]) {
    self[m] = () => self;
  }
  self["update"] = (payload: unknown) => {
    spy.updated = payload;
    return self;
  };
  self["insert"] = (payload: unknown) => {
    spy.inserted = payload;
    return self;
  };
  self["then"] = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return self;
}

function toolsFor(tables: Record<string, unknown>, spy: Spy) {
  const supabase = {
    rpc: () => query(null, spy),
    from: (table: string) => query(tables[table] ?? null, spy),
  };
  const server = buildMcpServer({ supabase: supabase as never, userId: USER });
  return (
    server as unknown as {
      _registeredTools: Record<
        string,
        { handler: (input: Record<string, unknown>) => Promise<unknown> }
      >;
    }
  )._registeredTools;
}

const characterRow = { id: CHARACTER_ID, name: "Brann", owner_id: USER, campaign_id: null };

async function runUpdate(row: Record<string, unknown>, input: Record<string, unknown>) {
  const spy: Spy = {};
  const tools = toolsFor({ character_entries: row, characters: characterRow }, spy);
  await tools["update_character_entry"]!.handler({ entry_id: ENTRY_ID, ...input });
  return spy.updated as Record<string, unknown>;
}

describe("C — update_character_entry(points) on a LINKED skill", () => {
  it("writes the same value to points and data.points, keeping every other key", async () => {
    const written = await runUpdate(
      {
        id: ENTRY_ID,
        name: "Broadsword",
        kind: "skill",
        category: null,
        character_id: CHARACTER_ID,
        points: 4,
        data: {
          attribute: "DX",
          difficulty: "A",
          points: 8,
          defaults: "DX-5",
          specialization: "Cavalry",
        },
        source: PACK_LINK.source,
      },
      { points: 12 },
    );

    expect(written["points"]).toBe(12);
    const data = written["data"] as Record<string, unknown>;
    expect(data["points"]).toBe(12);
    expect(data["attribute"]).toBe("DX");
    expect(data["difficulty"]).toBe("A");
    expect(data["defaults"]).toBe("DX-5");
    expect(data["specialization"]).toBe("Cavalry");
    // The pack link is provenance and must survive untouched.
    expect(written["source"]).toBeUndefined();
  });
});

describe("D — update_character_entry(points) on an UNLINKED skill", () => {
  it("normalises the touched row without damaging other data", async () => {
    const written = await runUpdate(
      {
        id: ENTRY_ID,
        name: "Stealth",
        kind: "skill",
        category: null,
        character_id: CHARACTER_ID,
        points: 0,
        data: { attribute: "DX", difficulty: "A", points: 8, bonus: 1 },
        source: {},
      },
      { points: 12 },
    );

    expect(written["points"]).toBe(12);
    const data = written["data"] as Record<string, unknown>;
    expect(data["points"]).toBe(12);
    expect(data["bonus"]).toBe(1);
  });

  it("normalises to the EFFECTIVE value when another field is edited", async () => {
    const written = await runUpdate(
      {
        id: ENTRY_ID,
        name: "Stealth",
        kind: "skill",
        category: null,
        character_id: CHARACTER_ID,
        points: 0,
        data: { attribute: "DX", difficulty: "A", points: 8 },
        source: {},
      },
      { notes: "trained in the marsh" },
    );

    expect(written["points"]).toBe(8);
    expect((written["data"] as Record<string, unknown>)["points"]).toBe(8);
  });
});

describe("F — add_character_entry never creates a mismatch", () => {
  it("keeps both representations equal for a custom skill", async () => {
    const spy: Spy = {};
    const tools = toolsFor(
      { characters: characterRow, character_entries: { id: ENTRY_ID, name: "Stealth" } },
      spy,
    );
    await tools["add_character_entry"]!.handler({
      character_id: CHARACTER_ID,
      kind: "skill",
      name: "Stealth",
      points: 4,
    });
    const payload = spy.inserted as Record<string, unknown>;
    expect(payload["points"]).toBe(4);
    expect((payload["data"] as Record<string, unknown>)["points"]).toBe(4);
  });

  it("keeps both representations equal for a trait (unchanged behaviour)", async () => {
    const spy: Spy = {};
    const tools = toolsFor(
      { characters: characterRow, character_entries: { id: ENTRY_ID, name: "Luck" } },
      spy,
    );
    await tools["add_character_entry"]!.handler({
      character_id: CHARACTER_ID,
      kind: "advantage",
      name: "Luck",
      points: 15,
    });
    const payload = spy.inserted as Record<string, unknown>;
    expect(payload["points"]).toBe(15);
    expect(payload["data"]).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* UI and pack paths                                                   */
/* ------------------------------------------------------------------ */

describe("E — the sheet editor keeps both values consistent", () => {
  it("starts a new skill draft with matching values", () => {
    const draft = emptyDraft("skill");
    expect(draft.points).toBe(1);
    expect(draft.data["points"]).toBe(1);
  });

  it("loads a legacy row into a draft at its effective value", () => {
    const draft = toDraft(entry({ points: 0, data: { difficulty: "A", points: 8 } }));
    expect(draft.points).toBe(8);
    expect(draft.data["points"]).toBe(8);
  });

  it("loads a linked row at the authoritative top-level value", () => {
    const draft = toDraft(entry({ points: 12, data: { points: 8 }, ...PACK_LINK }));
    expect(draft.points).toBe(12);
    expect(draft.data["points"]).toBe(12);
  });
});

describe("G — add from pack and restore preserve effective invested points", () => {
  it("creates a library draft with no mismatch", () => {
    const draft = libraryEntryToCharacterDraft({
      kind: "skill",
      name: "Broadsword",
      category: null,
      base_points: 2,
      summary: null,
      data: { attribute: "DX", difficulty: "A", points: 4 },
      source_label: "Pack",
      source_edition: null,
      source_page: null,
      source_type: "pack",
    });
    expect(draft.points).toBe(4);
    expect(draft.data["points"]).toBe(4);
  });

  it("restore never resurrects a stale shadow on a linked entry", () => {
    const patch = restoreDefinitionPatch(
      {
        kind: "skill",
        name: "Broadsword",
        category: null,
        points: 12,
        levels: 1,
        data: { attribute: "DX", difficulty: "A", points: 8 },
        source: PACK_LINK.source,
      },
      {
        id: "pack-1",
        kind: "skill",
        name: "Broadsword",
        category: null,
        base_points: 2,
        cost_per_level: null,
        max_levels: null,
        data: { attribute: "DX", difficulty: "A" },
      } as never,
    );
    expect(patch.points).toBe(12);
    expect((patch.data as Record<string, unknown>)["points"]).toBe(12);
  });
});

describe("H — every consumer agrees on one investment", () => {
  it("computePoints and skillLevel read the same helper", () => {
    const e = entry({
      points: 12,
      data: { attribute: "DX", difficulty: "A", points: 8 },
      ...PACK_LINK,
    });
    const sheet = buildSheet(character, [e], defaultRuleset);
    expect(sheet.points.skills).toBe(12);
    expect(sheet.skills[0]!.level.relative).toBe(3);
    expect(investedPoints(e)).toBe(12);
  });

  it("syncInvestedPoints leaves non-skill kinds alone", () => {
    const out = syncInvestedPoints({ kind: "advantage", points: 15, data: { note: "x" } });
    expect(out.points).toBe(15);
    expect(out.data["points"]).toBeUndefined();
  });
});
