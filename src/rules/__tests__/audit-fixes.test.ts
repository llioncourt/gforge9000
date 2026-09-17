import { describe, expect, it } from "vitest";
import {
  attributePoints,
  computeEncumbrance,
  defaultRuleset,
  mergeRuleset,
  modifiedCost,
  parseRoF,
  skillLevel,
  techniqueLevel,
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
  return { id: "e", kind: "advantage", name: "x", points: 0, levels: 1, data: {}, ...over };
}

describe("F-01 negative point costs round away from zero", () => {
  const half = [{ name: "Limitation", percent: -50 }];

  it("mirrors the positive rounding for negative bases", () => {
    expect(modifiedCost(15, half)).toBe(8);
    expect(modifiedCost(-15, half)).toBe(-8);
  });

  it("never returns -0", () => {
    const result = modifiedCost(-1, half);
    expect(result).toBe(-1);
    expect(Object.is(result, -0)).toBe(false);
    expect(Object.is(modifiedCost(0, half), -0)).toBe(false);
  });

  it("keeps up/down rounding symmetric in magnitude", () => {
    const up = mergeRuleset(defaultRuleset, { modifierRounding: "up" });
    const down = mergeRuleset(defaultRuleset, { modifierRounding: "down" });
    expect(modifiedCost(15, half, up)).toBe(8);
    expect(modifiedCost(-15, half, up)).toBe(-8);
    expect(modifiedCost(15, half, down)).toBe(7);
    expect(modifiedCost(-15, half, down)).toBe(-7);
  });
});

describe("F-15 fractional attribute costs round once at the total", () => {
  it("keeps quarter-step precision under a non-default speed cost", () => {
    const rules = mergeRuleset(defaultRuleset, { secondaryCost: { speed: 15 } });
    const character = { ...base, speed_delta: 0.25 };
    expect(attributePoints(character, rules)).toBe(4);
    expect(attributePoints({ ...base, speed_delta: 0.5 }, rules)).toBe(8);
  });

  it("is unchanged for the default cost", () => {
    expect(attributePoints({ ...base, speed_delta: 0.25 })).toBe(5);
  });
});

describe("F-17 a winning default is reported consistently", () => {
  it("relabels level and relative when the default beats the purchase", () => {
    const stats = { st: 10, dx: 14, iq: 10, ht: 10, hp: 10, will: 10, per: 10, fp: 10, basicSpeed: 6, basicMove: 6, basicLift: 20, dodge: 9 };
    const level = skillLevel(
      entry({ kind: "skill", data: { attribute: "IQ", difficulty: "A", points: 1, defaults: "DX-1" } }),
      stats,
    );
    expect(level.effective).toBe(13);
    expect(level.fromDefault).toBe(true);
    expect(level.defaultFrom).toBe("DX");
    expect(level.relative).toBe(3);
  });
});

describe("F-16 techniques without a declared default penalty", () => {
  it("flags the unknown cap instead of silently allowing unlimited levels", () => {
    const result = techniqueLevel(entry({ kind: "technique", data: { difficulty: "A", points: 8 } }), 12);
    expect(result.penaltyUnknown).toBe(true);
    const known = techniqueLevel(
      entry({ kind: "technique", data: { difficulty: "A", points: 8, defaultPenalty: -2 } }),
      12,
    );
    expect(known.penaltyUnknown).toBe(false);
    expect(known.levels).toBe(2);
    expect(known.capped).toBe(true);
  });
});

describe("F-30 rate of fire keeps the jet marker", () => {
  it("carries the trailing !", () => {
    const jet = parseRoF("3!");
    expect(jet.status).toBe("resolved");
    expect(jet.value?.jet).toBe(true);
    expect(parseRoF("3").value?.jet).toBe(false);
  });
});

describe("F-32 encumbrance boundaries with a fractional Basic Lift", () => {
  it("classifies an exact multiple of a fractional Basic Lift as the lower tier", () => {
    const entries = [
      entry({ kind: "equipment", name: "load", data: { weight: 72.60000000000001, quantity: 1, carried: true } }),
    ];
    const result = computeEncumbrance(entries, { basicLift: 24.2, basicMove: 6, dodge: 9 });
    expect(result.level).toBe(2);
  });
});
