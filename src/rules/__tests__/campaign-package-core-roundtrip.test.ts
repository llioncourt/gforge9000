/**
 * Core-path regression coverage for the campaign package (FIX-01..FIX-04).
 *
 * These tests drive the REAL export and import cores against an in-memory
 * stand-in for the RLS-scoped client, so the roundtrip guarantee is proven by
 * running the code rather than by inspecting it:
 *  - a character entry's whole `source` bag (unknown keys and the pack link
 *    included) survives export -> import even when the library has a matching
 *    row with different metadata;
 *  - re-importing the same package stays idempotent and still preserves it;
 *  - campaign `quirk_limit` survives export -> schema -> import;
 *  - gear restore drops a stat the current pack no longer defines.
 */

import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";

import { buildCampaignPackageZipCore } from "@/lib/campaign-package-export-core";
import { importCampaignPackageCore } from "@/lib/campaign-package-import-core";
import { parseCampaignPackageManifest } from "@/lib/campaign-package";
import { restoreDefinitionPatch, type PackItemLike } from "@/lib/pack-link";
import type { Client } from "@/lib/mcp/kit.server";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Minimal chainable fake: filters on `eq`, ignores ordering/ranges. */
function fakeClient(tables: Tables) {
  const ensure = (name: string) => (tables[name] ??= []);

  function from(name: string) {
    const filters: [string, unknown][] = [];
    const rows = () => ensure(name).filter((r) => filters.every(([k, v]) => r[k] === v));
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      in: () => builder,
      eq: (col: string, value: unknown) => {
        filters.push([col, value]);
        return builder;
      },
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => {
        const row = rows()[0];
        return { data: row ?? null, error: row ? null : { message: "not found" } };
      },
      insert: (payload: Row | Row[]) => {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r) => ({
          id: crypto.randomUUID(),
          ...r,
        }));
        ensure(name).push(...list);
        return {
          select: () => ({ single: async () => ({ data: list[0], error: null }) }),
          then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
            resolve({ data: list, error: null }),
        };
      },
      update: (patch: Row) => ({
        eq: async (col: string, value: unknown) => {
          for (const row of ensure(name)) if (row[col] === value) Object.assign(row, patch);
          return { data: null, error: null };
        },
      }),
      delete: () => ({
        eq: async (col: string, value: unknown) => {
          tables[name] = ensure(name).filter((r) => r[col] !== value);
          return { data: null, error: null };
        },
      }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: rows(), error: null }),
    };
    return builder;
  }

  const storage = {
    from: () => ({
      download: async () => ({ data: null, error: { message: "not found" } }),
      upload: async () => ({ data: { path: "x" }, error: null }),
      remove: async () => ({ data: null, error: null }),
    }),
  };

  return { tables, client: { from, storage } as unknown as Client };
}

const HISTORIC_SOURCE = {
  label: "Old Book",
  edition: "4e",
  page: "B222",
  type: "official",
  pack: "Legacy Pack",
  imported_as: "Furtividade",
  custom_future_key: { a: 1 },
  link: {
    pack_id: "pack-legacy",
    pack_name: "Legacy Pack",
    pack_entry_id: "item-legacy",
    pack_version: "hash-legacy",
    linked_at: "2026-01-01T00:00:00.000Z",
    link_method: "ui_picker",
  },
};

function seedSource() {
  return fakeClient({
    campaigns: [
      {
        id: "camp-1",
        name: "Ashes",
        description: null,
        gm_id: "gm-1",
        settings: { point_limit: 150, disadvantage_limit: -50, quirk_limit: -5, tech_level: 9 },
      },
    ],
    characters: [
      {
        id: "char-1",
        campaign_id: "camp-1",
        owner_id: "gm-1",
        name: "Vix",
        player_name: null,
        concept: null,
        point_budget: 150,
        tech_level: 9,
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
        current_hp: null,
        current_fp: null,
        conditions: [],
        wealth: "Average",
        status: 0,
        notes: null,
        is_npc: false,
        approved: false,
        portrait_path: null,
      },
    ],
    character_entries: [
      {
        id: "entry-1",
        character_id: "char-1",
        kind: "skill",
        name: "Stealth",
        category: "Physical",
        points: 4,
        levels: 1,
        data: {},
        notes: null,
        source: HISTORIC_SOURCE,
        sort_order: 0,
      },
    ],
  });
}

/** Target side: a library row whose metadata deliberately differs. */
function targetTables(): Tables {
  return {
    campaigns: [],
    characters: [],
    character_entries: [],
    library_entries: [
      {
        kind: "skill",
        name: "Stealth",
        category: "Physical",
        base_points: 2,
        cost_per_level: 0,
        summary: null,
        data: {},
        pack: "New Pack",
        source_label: "New Book",
        source_edition: "5e",
        source_page: "N1",
        source_type: "user",
      },
    ],
  };
}

describe("campaign package core roundtrip", () => {
  it("exports a character entry with its full source bag, then imports it unchanged", async () => {
    const source = seedSource();
    const { bytes } = await buildCampaignPackageZipCore(source.client, "camp-1");

    // A. the exported portable character carries the whole source object.
    const archive = unzipSync(bytes) as Record<string, Uint8Array>;
    const manifest = parseCampaignPackageManifest(
      new TextDecoder().decode(archive["campaign.json"]!),
    );
    const charFile = manifest.characters[0]!.file;
    const portable = JSON.parse(new TextDecoder().decode(archive[charFile]!)) as {
      entries: { source: Record<string, unknown> }[];
    };
    expect(portable.entries[0]!.source).toEqual(HISTORIC_SOURCE);

    // B + C. importing preserves it even though a matching library row exists
    // with different label/edition/page/pack.
    const target = fakeClient(targetTables());
    const summary = await importCampaignPackageCore(target.client, "gm-2", bytes);
    const imported = target.tables["character_entries"]!;
    expect(imported).toHaveLength(1);
    expect(imported[0]!["source"]).toEqual(HISTORIC_SOURCE);
    expect(summary.characters).toBe(1);

    // E. quirk_limit survived export -> schema -> import.
    expect(manifest.campaign.settings?.quirk_limit).toBe(-5);
    const campaign = target.tables["campaigns"]![0]!;
    expect((campaign["settings"] as Record<string, unknown>)["quirk_limit"]).toBe(-5);

    // D. a repeat import is idempotent and still preserves provenance.
    await importCampaignPackageCore(target.client, "gm-2", bytes);
    expect(target.tables["campaigns"]).toHaveLength(1);
    expect(target.tables["character_entries"]).toHaveLength(1);
    expect(target.tables["character_entries"]![0]!["source"]).toEqual(HISTORIC_SOURCE);
  });

  it("keeps an old package without quirk_limit valid", async () => {
    const source = seedSource();
    (source.tables["campaigns"]![0]!["settings"] as Record<string, unknown>)["quirk_limit"] =
      undefined;
    delete (source.tables["campaigns"]![0]!["settings"] as Record<string, unknown>)["quirk_limit"];
    const { bytes } = await buildCampaignPackageZipCore(source.client, "camp-1");
    const archive = unzipSync(bytes) as Record<string, Uint8Array>;
    const manifest = parseCampaignPackageManifest(
      new TextDecoder().decode(archive["campaign.json"]!),
    );
    expect(manifest.campaign.settings?.quirk_limit).toBeUndefined();

    const target = fakeClient(targetTables());
    await importCampaignPackageCore(target.client, "gm-2", bytes);
    const settings = target.tables["campaigns"]![0]!["settings"] as Record<string, unknown>;
    expect("quirk_limit" in settings).toBe(false);
  });
});

describe("equipment restore removes obsolete pack stats (FIX-02)", () => {
  it("syncs weight, drops a DR the current pack no longer defines, keeps state", () => {
    const item: PackItemLike = {
      id: "item-1",
      name: "Leather Jacket",
      kind: "equipment",
      category: "Gear",
      base_points: 0,
      cost_per_level: 0,
      max_levels: null,
      data: { weight: 8 },
    } as PackItemLike;

    const patch = restoreDefinitionPatch(
      {
        kind: "equipment",
        name: "Leather Jacket",
        category: "Gear",
        points: 0,
        levels: 1,
        data: { dr: 4, weight: 10, quantity: 2, carried: false, notes: "mine" },
      } as never,
      item,
    );

    expect(patch.data["weight"]).toBe(8);
    expect("dr" in patch.data).toBe(false);
    expect(patch.data["quantity"]).toBe(2);
    expect(patch.data["carried"]).toBe(false);
    expect(patch.data["notes"]).toBe("mine");
  });
});
