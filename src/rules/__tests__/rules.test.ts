import { describe, expect, it } from "vitest";
import {
  attributePoints,
  basicDamage,
  buildSheet,
  computeEncumbrance,
  computePoints,
  deriveStats,
  modifiedCost,
  parseDice,
  pointsForRelativeLevel,
  relativeLevel,
  resolveSuccess,
  rollExpression,
  rollSuccess,
  seededRng,
  skillLevel,
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
  return { id: Math.random().toString(), kind: "advantage", name: "x", points: 0, levels: 1, data: {}, ...over };
}

describe("derived stats", () => {
  it("derives secondary characteristics from primaries", () => {
    const s = deriveStats({ ...base, dx: 12, ht: 11, st: 12 });
    expect(s.hp).toBe(12);
    expect(s.basicSpeed).toBe(5.75);
    expect(s.basicMove).toBe(5);
    expect(s.basicLift).toBe(29);
    expect(s.dodge).toBe(8);
  });

  it("applies secondary deltas", () => {
    const s = deriveStats({ ...base, hp_delta: 3, will_delta: 2, fp_delta: -1, move_delta: 1 });
    expect(s.hp).toBe(13);
    expect(s.will).toBe(12);
    expect(s.fp).toBe(9);
    expect(s.basicMove).toBe(6);
  });
});

describe("point totals", () => {
  it("costs primary attributes", () => {
    expect(attributePoints({ ...base, st: 12, dx: 11, iq: 12, ht: 9 })).toBe(20 + 20 + 40 - 10);
  });

  it("costs secondary adjustments", () => {
    expect(attributePoints({ ...base, hp_delta: 2, speed_delta: 0.25 })).toBe(4 + 5);
  });

  it("sums advantages, disadvantages and skills", () => {
    const entries = [
      entry({ kind: "advantage", name: "Quick Reflexes", points: 15 }),
      entry({ kind: "disadvantage", name: "Code of Conduct", points: -10 }),
      entry({ kind: "quirk", name: "Hums when nervous", points: -1 }),
      entry({ kind: "skill", name: "Urban Navigation", data: { attribute: "IQ", difficulty: "A", points: 4 } }),
    ];
    const p = computePoints({ ...base, point_budget: 100 }, entries);
    expect(p.advantages).toBe(15);
    expect(p.disadvantages).toBe(-10);
    expect(p.quirks).toBe(-1);
    expect(p.skills).toBe(4);
    expect(p.total).toBe(8);
    expect(p.remaining).toBe(92);
  });

  it("multiplies levelled traits and applies modifiers", () => {
    expect(computePoints(base, [entry({ points: 5, levels: 3 })]).advantages).toBe(15);
    expect(modifiedCost(20, [{ name: "Limited", percent: -40 }])).toBe(12);
    expect(modifiedCost(20, [{ name: "Extended", percent: 100 }])).toBe(40);
    expect(
      computePoints(base, [entry({ points: 10, levels: 1, data: { modifiers: [{ name: "L", percent: -50 }] } })])
        .advantages,
    ).toBe(5);
  });

  it("ignores equipment in point totals", () => {
    expect(computePoints(base, [entry({ kind: "equipment", points: 99, data: { weight: 1, cost: 1 } })]).total).toBe(0);
  });

  it("recalculates after edits", () => {
    const entries = [entry({ kind: "advantage", points: 10 })];
    const first = computePoints(base, entries).total;
    entries[0]!.points = 25;
    entries.push(entry({ kind: "disadvantage", points: -5 }));
    expect(computePoints(base, entries).total).toBe(first + 15 - 5);
  });
});

describe("skills", () => {
  it("maps points to relative level", () => {
    expect(relativeLevel(1, "E")).toBe(0);
    expect(relativeLevel(2, "E")).toBe(1);
    expect(relativeLevel(4, "E")).toBe(2);
    expect(relativeLevel(8, "E")).toBe(3);
    expect(relativeLevel(4, "A")).toBe(1);
    expect(relativeLevel(4, "H")).toBe(0);
    expect(relativeLevel(4, "VH")).toBe(-1);
    expect(relativeLevel(0, "A")).toBeNull();
  });

  it("computes effective level from controlling attribute", () => {
    const stats = deriveStats({ ...base, iq: 12 });
    const level = skillLevel(
      entry({ kind: "skill", data: { attribute: "IQ", difficulty: "H", points: 4, bonus: 1 } }),
      stats,
    );
    expect(level.relative).toBe(0);
    expect(level.effective).toBe(13);
    expect(level.label).toBe("IQ+0");
  });

  it("inverts points for a target relative level", () => {
    for (const d of ["E", "A", "H", "VH"] as const) {
      for (let target = -3; target <= 4; target++) {
        const pts = pointsForRelativeLevel(target, d);
        if (pts > 0) expect(relativeLevel(pts, d)).toBe(target);
      }
    }
  });
});

describe("encumbrance", () => {
  const stats = deriveStats({ ...base, st: 10 }); // BL 20
  it("reports no encumbrance under basic lift", () => {
    const e = computeEncumbrance([entry({ kind: "equipment", data: { weight: 5, quantity: 2, carried: true } })], {
      basicLift: stats.basicLift,
      basicMove: stats.basicMove,
      dodge: stats.dodge,
    });
    expect(e.carriedWeight).toBe(10);
    expect(e.label).toBe("None");
    expect(e.effectiveMove).toBe(stats.basicMove);
  });

  it("steps up tiers and penalises move and dodge", () => {
    const e = computeEncumbrance([entry({ kind: "equipment", data: { weight: 55, carried: true } })], {
      basicLift: stats.basicLift,
      basicMove: 5,
      dodge: 8,
    });
    expect(e.label).toBe("Medium");
    expect(e.effectiveMove).toBe(3);
    expect(e.effectiveDodge).toBe(6);
  });

  it("excludes stored gear from carried weight", () => {
    const e = computeEncumbrance(
      [
        entry({ kind: "equipment", data: { weight: 100, carried: false } }),
        entry({ kind: "equipment", data: { weight: 4, carried: true } }),
      ],
      { basicLift: stats.basicLift, basicMove: 5, dodge: 8 },
    );
    expect(e.carriedWeight).toBe(4);
    expect(e.totalWeight).toBe(104);
    expect(e.label).toBe("None");
  });
});

describe("dice", () => {
  it("parses expressions", () => {
    expect(parseDice("3d6")).toEqual({ count: 3, sides: 6, modifier: 0, multiplier: 1 });
    expect(parseDice("2d-1")).toEqual({ count: 2, sides: 6, modifier: -1, multiplier: 1 });
    expect(parseDice("1d6+2")).toEqual({ count: 1, sides: 6, modifier: 2, multiplier: 1 });
    expect(parseDice("nonsense")).toBeNull();
  });

  it("rolls deterministically with a seeded rng", () => {
    const a = rollExpression("3d6", seededRng(42));
    const b = rollExpression("3d6", seededRng(42));
    expect(a).toEqual(b);
    expect(a!.dice).toHaveLength(3);
    expect(a!.total).toBeGreaterThanOrEqual(3);
    expect(a!.total).toBeLessThanOrEqual(18);
  });

  it("resolves success, failure and criticals", () => {
    expect(resolveSuccess(10, 12).outcome).toBe("success");
    expect(resolveSuccess(10, 12).margin).toBe(2);
    expect(resolveSuccess(14, 12).outcome).toBe("failure");
    expect(resolveSuccess(4, 12).outcome).toBe("critical success");
    expect(resolveSuccess(5, 16).outcome).toBe("critical success");
    expect(resolveSuccess(18, 20).outcome).toBe("critical failure");
    expect(resolveSuccess(17, 12).outcome).toBe("critical failure");
    expect(resolveSuccess(16, 6).outcome).toBe("critical failure");
  });

  it("produces a success roll against a target", () => {
    const r = rollSuccess(14, seededRng(7));
    expect(r.target).toBe(14);
    expect(r.margin).toBe(14 - r.total);
  });
});

describe("basic damage", () => {
  it("reports unavailable rather than inventing a formula", () => {
    expect(basicDamage(10, null).status).toBe("not-configured");
    expect(basicDamage(16, null).thrust).toBeNull();
  });
});

describe("full sheet", () => {
  it("assembles stats, points and encumbrance together", () => {
    const entries = [
      entry({ kind: "advantage", name: "Field Medic Training", points: 10 }),
      entry({ kind: "skill", name: "Urban Navigation", data: { attribute: "IQ", difficulty: "A", points: 4 } }),
      entry({ kind: "equipment", name: "Field Kit", data: { weight: 8, cost: 200, quantity: 1, carried: true, dr: 2, locations: ["Torso"] } }),
    ];
    const sheet = buildSheet({ ...base, st: 11, iq: 12 }, entries);
    expect(sheet.points.total).toBe(10 + 4 + 10 + 40);
    expect(sheet.skills[0]!.level.effective).toBe(13);
    expect(sheet.dr["Torso"]).toBe(2);
    expect(sheet.encumbrance.label).toBe("None");
  });
});
