import { describe, expect, it } from "vitest";
import {
  RULES_AUDIT,
  basicDamage,
  basicLift,
  bestDefault,
  blockFromSkill,
  buildSheet,
  checkLimits,
  computePoints,
  defaultRuleset,
  deriveStats,
  fpState,
  hpState,
  mergeRuleset,
  modifiedCost,
  parseDefaults,
  parryFromSkill,
  skillLevel,
  techniqueLevel,
  techniqueLevels,
  validateDamageProgression,
  withRetreat,
  type DamageProgression,
} from "../index";
import type { CharacterEntry, CharacterRecord } from "../types";

const base: CharacterRecord = {
  id: "c1",
  name: "Test",
  point_budget: 150,
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
  conditions: [],
  wealth: "Average",
  status: 0,
};

function entry(over: Partial<CharacterEntry>): CharacterEntry {
  return {
    id: Math.random().toString(),
    kind: "advantage",
    name: "x",
    points: 0,
    levels: 1,
    data: {},
    ...over,
  };
}

const progression: DamageProgression = {
  id: "test",
  label: "Test progression",
  rows: [
    { st: 10, thrust: "1d-2", swing: "1d" },
    { st: 12, thrust: "1d-1", swing: "1d+2" },
    { st: 14, thrust: "1d", swing: "2d" },
  ],
};

describe("basic damage is data-driven", () => {
  it("is unavailable with no progression installed", () => {
    const d = basicDamage(12, null);
    expect(d.status).toBe("not-configured");
    expect(d.thrust).toBeNull();
    expect(d.swing).toBeNull();
  });

  it("never invents a value through buildSheet", () => {
    const sheet = buildSheet({ ...base, st: 13 }, []);
    expect(sheet.damage.status).toBe("not-configured");
    expect(sheet.damage.thrust).toBeNull();
  });

  it("looks up exact and lower-bound rows", () => {
    expect(basicDamage(12, progression)).toMatchObject({
      status: "configured",
      thrust: "1d-1",
      swing: "1d+2",
    });
    expect(basicDamage(13, progression)).toMatchObject({ status: "configured", thrust: "1d-1" });
  });

  it("flags ST outside the configured range", () => {
    expect(basicDamage(8, progression).status).toBe("out-of-range");
    expect(basicDamage(8, progression).thrust).toBeNull();
    expect(basicDamage(20, progression).status).toBe("out-of-range");
  });

  it("validates user-supplied progressions", () => {
    expect(validateDamageProgression(progression)).toEqual([]);
    const bad = validateDamageProgression({
      id: "b",
      label: "b",
      rows: [
        { st: 10, thrust: "oops", swing: "1d" },
        { st: 10, thrust: "1d", swing: "1d" },
      ],
    });
    expect(bad.length).toBe(2);
  });

  it("uses a progression supplied through the ruleset", () => {
    const rules = mergeRuleset(defaultRuleset, { damageProgression: progression });
    const sheet = buildSheet({ ...base, st: 14 }, [], rules);
    expect(sheet.damage).toMatchObject({ status: "configured", thrust: "1d", swing: "2d" });
  });
});

describe("skill defaults", () => {
  it("parses attribute and skill defaults", () => {
    expect(parseDefaults("DX-5, IQ-4, Urban Navigation-2")).toEqual([
      { from: "DX", penalty: -5, isAttribute: true },
      { from: "IQ", penalty: -4, isAttribute: true },
      { from: "Urban Navigation", penalty: -2, isAttribute: false },
    ]);
    expect(parseDefaults(undefined)).toEqual([]);
  });

  it("picks the best resolvable default", () => {
    const stats = deriveStats({ ...base, dx: 12, iq: 10 });
    const best = bestDefault(parseDefaults("DX-5, IQ-4, Tracking-1"), stats, {
      knownSkills: { Tracking: 14 },
    });
    expect(best).toMatchObject({ level: 13 });
  });

  it("gives an unpurchased skill its default level", () => {
    const stats = deriveStats({ ...base, dx: 12 });
    const level = skillLevel(
      entry({
        kind: "skill",
        data: { attribute: "DX", difficulty: "A", points: 0, defaults: "DX-4" },
      }),
      stats,
    );
    expect(level.fromDefault).toBe(true);
    expect(level.effective).toBe(8);
  });

  it("never drops a purchased skill below its default", () => {
    const stats = deriveStats({ ...base, dx: 12 });
    const level = skillLevel(
      entry({
        kind: "skill",
        data: { attribute: "IQ", difficulty: "H", points: 1, defaults: "DX-1" },
      }),
      stats,
    );
    expect(level.effective).toBe(11);
  });

  it("resolves skill-to-skill defaults inside buildSheet", () => {
    const sheet = buildSheet({ ...base, iq: 12 }, [
      entry({
        kind: "skill",
        name: "Urban Navigation",
        data: { attribute: "IQ", difficulty: "A", points: 4 },
      }),
      entry({
        kind: "skill",
        name: "Cartography",
        data: { attribute: "IQ", difficulty: "A", points: 0, defaults: "Urban Navigation-3" },
      }),
    ]);
    expect(sheet.skills[1]!.level.effective).toBe(10);
  });
});

describe("techniques", () => {
  it("costs levels by difficulty", () => {
    expect(techniqueLevels(0, "A")).toBe(0);
    expect(techniqueLevels(1, "A")).toBe(1);
    expect(techniqueLevels(3, "A")).toBe(3);
    expect(techniqueLevels(1, "H")).toBe(0);
    expect(techniqueLevels(2, "H")).toBe(1);
    expect(techniqueLevels(4, "H")).toBe(3);
  });

  it("caps bought levels at the default penalty", () => {
    const t = techniqueLevel(
      entry({
        kind: "technique",
        data: { difficulty: "H", points: 8, defaultPenalty: -2, baseSkill: "Brawling" },
      }),
      12,
    );
    expect(t.levels).toBe(2);
    expect(t.capped).toBe(true);
    expect(t.effective).toBe(12);
  });

  it("returns no level without a base skill level", () => {
    expect(
      techniqueLevel(entry({ kind: "technique", data: { difficulty: "A", points: 2 } }), null)
        .effective,
    ).toBeNull();
  });
});

describe("active defenses", () => {
  it("derives parry and block from a skill level", () => {
    expect(parryFromSkill(13)).toBe(9);
    expect(blockFromSkill(12)).toBe(9);
    expect(parryFromSkill(null)).toBeNull();
    expect(withRetreat(9)).toBe(12);
  });

  it("honours ruleset overrides", () => {
    const rules = mergeRuleset(defaultRuleset, {
      activeDefense: { ...defaultRuleset.activeDefense, parryBase: 4 },
    });
    expect(parryFromSkill(13, rules)).toBe(10);
  });
});

describe("health state", () => {
  it("labels reeling and collapse thresholds", () => {
    expect(hpState(10, 10).label).toBeNull();
    expect(hpState(3, 10).label).toBe("Reeling");
    expect(hpState(0, 10).label).toBe("Collapse risk");
    expect(hpState(-11, 10).label).toBe("Death risk");
    expect(fpState(3, 10).label).toBe("Tired");
  });

  it("defaults current to maximum when unset", () => {
    expect(hpState(null, 12).current).toBe(12);
  });
});

describe("modifiers and campaign overrides", () => {
  it("rounds according to the ruleset", () => {
    expect(modifiedCost(15, [{ name: "L", percent: -35 }])).toBe(10);
    const up = mergeRuleset(defaultRuleset, { modifierRounding: "up" });
    expect(modifiedCost(15, [{ name: "L", percent: -35 }], up)).toBe(10);
    const down = mergeRuleset(defaultRuleset, { modifierRounding: "down" });
    expect(modifiedCost(15, [{ name: "L", percent: -35 }], down)).toBe(9);
  });

  it("honours the configurable limitation floor", () => {
    expect(modifiedCost(20, [{ name: "L", percent: -95 }])).toBe(4);
    const rules = mergeRuleset(defaultRuleset, { modifierFloorPercent: -95 });
    expect(modifiedCost(20, [{ name: "L", percent: -95 }], rules)).toBe(1);
  });

  it("merges house rules section-wise", () => {
    const rules = mergeRuleset(defaultRuleset, { attributeCost: { ST: 5 } as never });
    expect(rules.attributeCost.ST).toBe(5);
    expect(rules.attributeCost.DX).toBe(20);
  });

  it("reports limit violations without mutating the sheet", () => {
    const rules = mergeRuleset(defaultRuleset, {
      limits: { pointBudget: 100, disadvantageLimit: 20, quirkLimit: 5, techLevel: 7 },
    });
    const entries = [
      entry({ kind: "disadvantage", points: -40 }),
      entry({ kind: "quirk", points: -6 }),
      entry({ kind: "advantage", points: 150 }),
    ];
    const breakdown = computePoints({ ...base, tech_level: 9 }, entries, rules);
    const violations = checkLimits({ ...base, tech_level: 9 }, breakdown, rules);
    expect(violations.map((v) => v.limit).sort()).toEqual([
      "disadvantageLimit",
      "pointBudget",
      "quirkLimit",
      "techLevel",
    ]);
    expect(breakdown.total).toBe(104);
  });
});

describe("audit metadata", () => {
  it("covers every audited area with a valid status", () => {
    expect(RULES_AUDIT.length).toBeGreaterThanOrEqual(18);
    for (const rule of RULES_AUDIT) {
      expect(["EXACT", "CONFIGURABLE", "APPROXIMATION", "MISSING"]).toContain(rule.status);
      expect(rule.implementation.length).toBeGreaterThan(0);
      expect(rule.notes.length).toBeGreaterThan(0);
    }
  });

  it("ships no approximations", () => {
    expect(RULES_AUDIT.filter((r) => r.status === "APPROXIMATION")).toEqual([]);
  });

  it("keeps unique ids", () => {
    expect(new Set(RULES_AUDIT.map((r) => r.id)).size).toBe(RULES_AUDIT.length);
  });
});

describe("Basic Lift precision", () => {
  it("preserves fractional values (ST 11, divisor 5 -> 24.2)", () => {
    expect(basicLift(11, defaultRuleset)).toBe(24.2);
    expect(deriveStats({ ...base, st: 11 }).basicLift).toBe(24.2);
  });

  it("keeps precision for other ST values and divisors", () => {
    expect(basicLift(12)).toBe(28.8);
    expect(basicLift(10)).toBe(20);
    expect(basicLift(13)).toBe(33.8);
    expect(basicLift(11, { ...defaultRuleset, basicLiftDivisor: 10 })).toBe(12.1);
  });
});

describe("audit coverage of required mechanics", () => {
  it("includes every mechanic required by the fidelity pass", () => {
    const ids = RULES_AUDIT.map((r) => r.id);
    for (const id of [
      "attr.primary-cost",
      "sec.hp-fp-will-per",
      "sec.basic-speed-move",
      "sec.basic-lift",
      "points.total",
      "traits.levels",
      "traits.modifiers",
      "skills.relative-level",
      "skills.defaults",
      "skills.techniques",
      "equip.encumbrance",
      "equip.dr",
      "combat.active-defenses",
      "combat.basic-damage",
      "combat.health",
      "combat.weapon-parsing",
      "dice.expressions",
      "dice.success",
      "campaign.overrides",
    ]) {
      expect(ids).toContain(id);
    }
  });
});
