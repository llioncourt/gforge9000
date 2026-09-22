/**
 * Regression tests for the pack-linking corrections.
 *
 * Each block states the rule it protects, because several of these were bugs
 * that the original test suite happily agreed with.
 */

import { describe, expect, it } from "vitest";
import {
  hashDefinition,
  packDefinition,
  withPackLink,
  withoutPackLink,
  type PackItemLike,
  type PackLink,
} from "@/lib/pack-link";
import { resolutionFor, type ResolvedPackItems } from "@/lib/pack-link-service";
import { validateCharacter } from "@/lib/pack-validation";
import type { CharacterRecord } from "@/rules";
import { defaultRuleset } from "@/rules/ruleset";

const link: PackLink = {
  pack_id: "pack-1",
  pack_name: "Core",
  pack_entry_id: "item-1",
  pack_version: "v1:sha256:aaaa",
  linked_at: "2026-01-01T00:00:00.000Z",
  link_method: "ui_picker",
};

/* ------------------------------------------------------------------ */
/* PL-004 — removed vs inaccessible must be provable, never guessed    */
/* ------------------------------------------------------------------ */

function resolved(overrides: Partial<ResolvedPackItems> = {}): ResolvedPackItems {
  return {
    byId: new Map(),
    visiblePackIds: new Set<string>(),
    ownedPackIds: new Set<string>(),
    ...overrides,
  };
}

describe("missing pack item: removed vs inaccessible", () => {
  it("claims removed only when the caller owns the pack", async () => {
    const result = await resolutionFor(
      link,
      resolved({ visiblePackIds: new Set(["pack-1"]), ownedPackIds: new Set(["pack-1"]) }),
      undefined,
    );
    expect(result.missingReason).toBe("removed");
  });

  it("stays conservative when the pack is visible but not owned", async () => {
    // Access rules can hide a single item while the pack itself is visible,
    // so "gone" cannot be proved here.
    const result = await resolutionFor(
      link,
      resolved({ visiblePackIds: new Set(["pack-1"]) }),
      undefined,
    );
    expect(result.missingReason).toBe("inaccessible");
  });

  it("reports inaccessible when the pack itself is not visible", async () => {
    const result = await resolutionFor(link, resolved(), undefined);
    expect(result.missingReason).toBe("inaccessible");
  });
});

/* ------------------------------------------------------------------ */
/* PL-005 — linking touches only source.link                           */
/* ------------------------------------------------------------------ */

describe("provenance preservation", () => {
  const source = {
    type: "book",
    label: "Basic Set",
    edition: "4e",
    page: "B34",
    pack: "Legacy Pack Name",
    imported_as: "Survival",
    something_unknown: { deep: true },
  };

  it("adds the link without rewriting any other provenance key", () => {
    const next = withPackLink(source, link);
    expect(next["pack"]).toBe("Legacy Pack Name");
    expect(next["label"]).toBe("Basic Set");
    expect(next["edition"]).toBe("4e");
    expect(next["page"]).toBe("B34");
    expect(next["imported_as"]).toBe("Survival");
    expect(next["something_unknown"]).toEqual({ deep: true });
    expect(next["link"]).toMatchObject({ pack_entry_id: "item-1" });
  });

  it("unlinking removes only the link", () => {
    const next = withoutPackLink(withPackLink(source, link));
    expect(next["link"]).toBeUndefined();
    expect(next).toMatchObject(source);
  });
});

/* ------------------------------------------------------------------ */
/* PL-006 — the version covers mechanics, not editorial text           */
/* ------------------------------------------------------------------ */

describe("pack version payload", () => {
  const base: PackItemLike = {
    kind: "skill",
    name: "Stealth",
    category: "Combat",
    base_points: 1,
    cost_per_level: 0,
    max_levels: null,
    data: { attribute: "DX", difficulty: "A", defaults: "DX-5" },
  };

  async function version(item: PackItemLike) {
    return hashDefinition(packDefinition(item));
  }

  it("changes when skill defaults change", async () => {
    const changed = { ...base, data: { ...base.data, defaults: "DX-4" } };
    expect(await version(changed)).not.toBe(await version(base));
  });

  it("changes when a technique default penalty changes", async () => {
    const technique: PackItemLike = {
      kind: "technique",
      name: "Disarm",
      base_points: 0,
      cost_per_level: 1,
      data: { baseSkill: "Judo", defaultPenalty: -4 },
    };
    const changed = { ...technique, data: { baseSkill: "Judo", defaultPenalty: -2 } };
    expect(await version(changed)).not.toBe(await version(technique));
  });

  it("does not change when only editorial text changes", async () => {
    const changed: PackItemLike = {
      ...base,
      data: { ...base.data, summary: "Sneaking about", notes: "see page 222", source_page: "B222" },
    };
    expect(await version(changed)).toBe(await version(base));
  });
});

/* ------------------------------------------------------------------ */
/* PL-003 — campaign limits are not the house-rule engine overrides    */
/* ------------------------------------------------------------------ */

describe("character validation against campaign limits", () => {
  const character = {
    id: "char-1",
    name: "Vale",
    point_budget: 500,
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
  } as unknown as CharacterRecord;

  it("judges the character against campaign settings, reporting house rules separately", () => {
    const report = validateCharacter({
      character,
      entries: [],
      statuses: new Map(),
      // Ordinary campaign constraints...
      campaignSettings: {
        point_limit: 100,
        disadvantage_limit: -40,
        quirk_limit: 5,
        tech_level: 8,
      },
      // ...deliberately different from the house-rule engine numbers.
      ruleset: {
        ...defaultRuleset,
        limits: {
          pointBudget: 999,
          disadvantageLimit: -999,
          quirkLimit: 99,
          techLevel: 12,
        },
      },
    });
    expect(report.campaign_limits).toEqual({
      point_limit: 100,
      disadvantage_limit: -40,
      quirk_limit: 5,
      tech_level: 8,
    });
    expect(report.house_rules.effective_limits.point_limit).toBe(999);
    expect(report.findings.map((f) => f.type)).toContain("tech_level");
  });
});
