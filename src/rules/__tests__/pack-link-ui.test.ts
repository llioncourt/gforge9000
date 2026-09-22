import { describe, expect, it } from "vitest";
import { libraryEntryToCharacterDraft } from "@/lib/portable";
import type { PackLink } from "@/lib/pack-link";
import { readPackLink, withoutPackLink, derivePackLinkState, type CharacterEntryLike } from "@/lib/pack-link";
import {
  entryStatusFingerprint,
  shouldShowRestoreAction,
  initBulkSelection,
  toggleBulkRow,
  chooseBulkCandidate,
  selectedBulkLinks,
  type BulkSelection,
} from "@/components/character/pack-link";
import type { CharacterEntry } from "@/rules";
import type { PackCandidate } from "@/lib/pack-match";
import { summarizeCampaign, type CharacterPackSummary } from "@/lib/pack-link-service";

const BASE_LIBRARY_ENTRY = {
  kind: "skill",
  name: "Climbing",
  category: null,
  base_points: 1,
  summary: null,
  data: {},
  pack: "Core Pack",
  source_label: "Core Pack",
  source_edition: null,
  source_page: null,
  source_type: "pack",
};

const SAMPLE_LINK: PackLink = {
  pack_id: "pack-1",
  pack_name: "Core Pack",
  pack_entry_id: "entry-1",
  pack_version: "v1:sha256:abc",
  linked_at: "2024-01-01T00:00:00.000Z",
  link_method: "ui_picker",
};

function entry(overrides: Record<string, unknown> = {}): CharacterEntry {
  return {
    id: "e1",
    character_id: "c1",
    kind: "skill",
    name: "Climbing",
    category: null,
    points: 1,
    levels: 1,
    notes: null,
    data: {},
    source: null,
    sort_order: 0,
    ...overrides,
  } as unknown as CharacterEntry;
}

function candidate(overrides: Partial<PackCandidate> = {}): PackCandidate {
  return {
    id: "entry-1",
    name: "Climbing",
    kind: "skill",
    category: null,
    base_points: 1,
    cost_per_level: 0,
    max_levels: null,
    data: {},
    pack: "Core Pack",
    pack_id: "pack-1",
    pack_name: "Core Pack",
    pack_version: "v1:sha256:abc",
    ...overrides,
  } as unknown as PackCandidate;
}

describe("libraryEntryToCharacterDraft + pack link (PL-001)", () => {
  it("carries source.link with link_method 'ui_picker' when a link is given", () => {
    const draft = libraryEntryToCharacterDraft(BASE_LIBRARY_ENTRY, SAMPLE_LINK);
    const link = readPackLink(draft.source);
    expect(link).not.toBeNull();
    expect(link?.link_method).toBe("ui_picker");
    expect(link?.pack_entry_id).toBe("entry-1");
    // legacy provenance keys survive
    expect(draft.source["label"]).toBe("Core Pack");
    expect(draft.source["pack"]).toBe("Core Pack");
  });

  it("has no link for a plain draft (free-text / custom entries)", () => {
    const draft = libraryEntryToCharacterDraft(BASE_LIBRARY_ENTRY);
    expect(readPackLink(draft.source)).toBeNull();
    const draftExplicitNull = libraryEntryToCharacterDraft(BASE_LIBRARY_ENTRY, null);
    expect(readPackLink(draftExplicitNull.source)).toBeNull();
  });
});

describe("badge state mapping", () => {
  it("maps official/modified/custom/stale to the expected derived states", () => {
    const custom = derivePackLinkState(entry({ source: null }), null);
    expect(custom.state).toBe("custom");

    const linkedEntry = entry({
      source: { link: SAMPLE_LINK },
    });
    const official = derivePackLinkState(linkedEntry as unknown as CharacterEntryLike, {
      item: candidate(),
      currentVersion: SAMPLE_LINK.pack_version,
      packAllowed: true,
    });
    expect(official.state).toBe("official");

    const modifiedEntry = entry({
      kind: "advantage",
      source: { link: SAMPLE_LINK },
      points: 4,
    });
    const modified = derivePackLinkState(modifiedEntry as unknown as CharacterEntryLike, {
      item: candidate({ kind: "advantage", base_points: 1, cost_per_level: 0 }),
      currentVersion: SAMPLE_LINK.pack_version,
      packAllowed: true,
    });
    expect(modified.state).toBe("modified");

    const stale = derivePackLinkState(linkedEntry as unknown as CharacterEntryLike, {
      item: null,
      packAllowed: true,
      missingReason: "removed",
    });
    expect(stale.state).toBe("stale");
    expect(stale.stale_reason).toBe("removed");
  });
});

describe("shouldShowRestoreAction (PL-007)", () => {
  it("is true only when modified/stale AND can_update", () => {
    expect(shouldShowRestoreAction({ state: "modified", link: SAMPLE_LINK, can_update: true })).toBe(true);
    expect(shouldShowRestoreAction({ state: "stale", link: SAMPLE_LINK, can_update: true })).toBe(true);
  });

  it("is false for removed/inaccessible/pack_not_allowed statuses", () => {
    expect(
      shouldShowRestoreAction({
        state: "stale",
        link: SAMPLE_LINK,
        stale_reason: "removed",
        can_update: false,
      }),
    ).toBe(false);
    expect(
      shouldShowRestoreAction({
        state: "stale",
        link: SAMPLE_LINK,
        stale_reason: "inaccessible",
        can_update: false,
      }),
    ).toBe(false);
    expect(
      shouldShowRestoreAction({
        state: "stale",
        link: SAMPLE_LINK,
        stale_reason: "pack_not_allowed",
        can_update: false,
      }),
    ).toBe(false);
    expect(shouldShowRestoreAction(undefined)).toBe(false);
    expect(shouldShowRestoreAction({ state: "official", link: SAMPLE_LINK, can_update: true })).toBe(false);
    expect(shouldShowRestoreAction({ state: "custom", link: null })).toBe(false);
  });
});

describe("diff rows for a pack-vs-sheet difference", () => {
  it("produces the field rows the popover renders", () => {
    const modifiedEntry = entry({
      kind: "advantage",
      source: { link: SAMPLE_LINK },
      category: "House rule",
      points: 4,
    });
    const status = derivePackLinkState(modifiedEntry as unknown as CharacterEntryLike, {
      item: candidate({ kind: "advantage", category: "Physical", base_points: 1, cost_per_level: 0 }),
      currentVersion: SAMPLE_LINK.pack_version,
      packAllowed: true,
    });
    expect(status.diff?.some((row) => row.field === "category")).toBe(true);
    expect(status.diff?.some((row) => row.field === "base_points")).toBe(true);
  });
});

describe("unlink preserves other provenance keys", () => {
  it("removes only source.link", () => {
    const source = {
      label: "Core Pack",
      edition: "4e",
      page: "12",
      type: "pack",
      pack: "Core Pack",
      link: SAMPLE_LINK,
    };
    const result = withoutPackLink(source);
    expect(readPackLink(result)).toBeNull();
    expect(result["label"]).toBe("Core Pack");
    expect(result["edition"]).toBe("4e");
    expect(result["page"]).toBe("12");
    expect(result["type"]).toBe("pack");
    expect(result["pack"]).toBe("Core Pack");
  });
});

describe("bulk-link helpers (PL-009)", () => {
  const unique = { entry: entry({ id: "e1" }), item: candidate({ id: "p1" }), candidates: [], status: "unique" as const };
  const ambiguous = {
    entry: entry({ id: "e2" }),
    item: null,
    candidates: [candidate({ id: "p2" }), candidate({ id: "p3" })],
    status: "ambiguous" as const,
  };
  const none = { entry: entry({ id: "e3" }), item: null, candidates: [], status: "none" as const };
  const proposals = [unique, ambiguous, none];

  it("defaults unique matches selected and leaves the rest unresolved", () => {
    const selection = initBulkSelection(proposals);
    expect(selection["e1"]).toEqual({ selected: true, item: unique.item });
    expect(selection["e2"]).toEqual({ selected: false, item: null });
    expect(selection["e3"]).toEqual({ selected: false, item: null });
  });

  it("deselecting a resolved row toggles it off", () => {
    const selection = initBulkSelection(proposals);
    const toggled = toggleBulkRow(selection, "e1");
    expect(toggled["e1"]?.selected).toBe(false);
    // toggling a row with no key at all (not part of the selection) is a no-op
    const untouched: BulkSelection = {};
    expect(toggleBulkRow(untouched, "missing")).toBe(untouched);
  });

  it("records the user's explicit choice for an ambiguous row", () => {
    const selection = initBulkSelection(proposals);
    const chosen = chooseBulkCandidate(selection, "e2", ambiguous.candidates[0]!);
    expect(chosen["e2"]).toEqual({ selected: true, item: ambiguous.candidates[0] });
    const cleared = chooseBulkCandidate(chosen, "e2", null);
    expect(cleared["e2"]).toEqual({ selected: false, item: null });
  });

  it("selectedBulkLinks only returns rows that are explicitly selected and resolved", () => {
    let selection: BulkSelection = initBulkSelection(proposals);
    selection = chooseBulkCandidate(selection, "e2", ambiguous.candidates[1]!);
    const links = selectedBulkLinks(selection, proposals);
    expect(links.map((l) => l.entry.id).sort()).toEqual(["e1", "e2"]);
    // deselecting the unique row removes it even though it is resolved
    selection = toggleBulkRow(selection, "e1");
    const linksAfterToggle = selectedBulkLinks(selection, proposals);
    expect(linksAfterToggle.map((l) => l.entry.id)).toEqual(["e2"]);
  });
});

describe("entry fingerprint (PL-011)", () => {
  it("changes when name, points, levels, category or data change", () => {
    const base = entryStatusFingerprint(entry());
    expect(entryStatusFingerprint(entry({ name: "Jumping" }))).not.toBe(base);
    expect(entryStatusFingerprint(entry({ points: 2 }))).not.toBe(base);
    expect(entryStatusFingerprint(entry({ levels: 2 }))).not.toBe(base);
    expect(entryStatusFingerprint(entry({ category: "Physical" }))).not.toBe(base);
    expect(
      entryStatusFingerprint(entry({ data: { attribute: "DX" } as never })),
    ).not.toBe(base);
  });

  it("stays the same when an unrelated field (notes) changes", () => {
    const base = entryStatusFingerprint(entry());
    expect(entryStatusFingerprint(entry({ notes: "unrelated" }))).toBe(base);
  });
});

describe("GM campaign summary (summarizeCampaign)", () => {
  it("counts official/modified/custom/stale per character", async () => {
    const linkedRow = { id: "r1", character_id: "ch1", kind: "skill", name: "Climbing", points: 1, levels: 1, data: {}, source: { link: SAMPLE_LINK } };
    const customRow = { id: "r2", character_id: "ch1", kind: "skill", name: "Riding", points: 1, levels: 1, data: {}, source: null };

    const fakeClient = {
      from(table: string) {
        if (table === "characters") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({ data: [{ id: "ch1", name: "Hero" }], error: null }),
              }),
            }),
          };
        }
        if (table === "character_entries") {
          return {
            select: () => ({
              in: async () => ({ data: [linkedRow, customRow], error: null }),
            }),
          };
        }
        if (table === "campaigns") {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { settings: undefined }, error: null }) }),
            }),
          };
        }
        if (table === "content_packs") {
          const thenable = {
            in: async () => ({ data: [], error: null }),
            then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
              resolve({ data: [], error: null }),
          };
          return { select: () => thenable };
        }
        if (table === "library_entries") {
          return {
            select: () => ({
              in: async () => ({ data: [candidate()], error: null }),
              eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const summary: CharacterPackSummary[] = await summarizeCampaign(
      fakeClient as never,
      "campaign-1",
    );
    expect(summary).toHaveLength(1);
    expect(summary[0]?.character_id).toBe("ch1");
    expect(summary[0]!.official + summary[0]!.modified + summary[0]!.custom + summary[0]!.stale).toBe(2);
    expect(summary[0]!.custom).toBeGreaterThanOrEqual(1);
  });
});
