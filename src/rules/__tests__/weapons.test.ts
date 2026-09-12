import { describe, expect, it } from "vitest";
import {
  RULES_AUDIT,
  accuracyModifier,
  additionalHits,
  consumeShots,
  createAmmoState,
  defaultRuleset,
  drByLocation,
  isEmpty,
  normalizeWeaponMode,
  parseRange,
  parseRoF,
  parseReach,
  parseRecoil,
  parseShots,
  reloadAmmo,
  resolveDamageExpression,
  type DamageProgression,
} from "../index";
import type { CharacterEntry } from "../types";

const progression: DamageProgression = {
  id: "test",
  label: "Test progression",
  rows: [
    { st: 10, thrust: "1d-2", swing: "1d" },
    { st: 12, thrust: "1d-1", swing: "1d+2" },
  ],
};

describe("RoF parsing", () => {
  it("parses single and multi-projectile forms", () => {
    expect(parseRoF("3").value).toEqual({
      shotsPerAttack: 3,
      multiProjectile: false,
      projectilesPerShot: 1,
    });
    expect(parseRoF("3x9").value).toEqual({
      shotsPerAttack: 3,
      multiProjectile: true,
      projectilesPerShot: 9,
    });
    expect(parseRoF("10!").status).toBe("resolved");
  });

  it("does not guess ambiguous text", () => {
    expect(parseRoF("1/2").status).toBe("unresolved");
    expect(parseRoF("see notes").status).toBe("unresolved");
    expect(parseRoF("1/2").raw).toBe("1/2");
  });

  it("reports unconfigured when absent", () => {
    expect(parseRoF(undefined).status).toBe("unconfigured");
    expect(parseRoF("  ").status).toBe("unconfigured");
  });
});

describe("recoil, range, reach and shots parsing", () => {
  it("accepts valid recoil only", () => {
    expect(parseRecoil("2").value).toBe(2);
    expect(parseRecoil("0").status).toBe("unresolved");
    expect(parseRecoil("2-3").status).toBe("unresolved");
    expect(parseRecoil(null).status).toBe("unconfigured");
  });

  it("parses short/max range and preserves ambiguous forms", () => {
    expect(parseRange("100/1500").value).toEqual({ short: 100, max: 1500 });
    expect(parseRange("120").value).toEqual({ short: null, max: 120 });
    const unresolved = parseRange("x10/x15");
    expect(unresolved.status).toBe("unresolved");
    expect(unresolved.raw).toBe("x10/x15");
  });

  it("parses reach and shots", () => {
    expect(parseReach("C,1").value).toEqual({ close: true, distances: [1] });
    expect(parseReach("1,2").value).toEqual({ close: false, distances: [1, 2] });
    expect(parseShots("30(3)").value).toEqual({ capacity: 30, reloadTime: 3 });
    expect(parseShots("many").status).toBe("unresolved");
  });
});

describe("ammunition state", () => {
  const state = createAmmoState({ capacity: 8, reloadTime: 3 });

  it("starts full and consumes deterministically without mutation", () => {
    expect(state.current).toBe(8);
    const fired = consumeShots(state, 3);
    expect(fired.ok).toBe(true);
    if (fired.ok) expect(fired.state.current).toBe(5);
    expect(state.current).toBe(8);
  });

  it("rejects impossible consumption", () => {
    expect(consumeShots(state, 0)).toMatchObject({ ok: false, reason: "invalid-amount" });
    expect(consumeShots(state, -2)).toMatchObject({ ok: false, reason: "invalid-amount" });
    expect(consumeShots(state, 1.5)).toMatchObject({ ok: false, reason: "invalid-amount" });
    expect(consumeShots(state, 9)).toMatchObject({ ok: false, reason: "insufficient-shots" });
  });

  it("exposes empty state and reloads", () => {
    const empty = createAmmoState({ capacity: 8, reloadTime: null }, 0);
    expect(isEmpty(empty)).toBe(true);
    expect(reloadAmmo(empty).current).toBe(8);
    expect(reloadAmmo(empty, 3).current).toBe(3);
    expect(reloadAmmo(state, 99).current).toBe(8);
  });
});

describe("rapid fire additional hits", () => {
  it("gives one hit per full multiple of recoil, capped by RoF", () => {
    expect(additionalHits({ margin: 5, recoil: 2, rof: 10 })).toEqual({
      status: "resolved",
      hits: 2,
      cappedBy: "margin",
    });
    expect(additionalHits({ margin: 20, recoil: 2, rof: 3 })).toEqual({
      status: "resolved",
      hits: 2,
      cappedBy: "rof",
    });
  });

  it("caps by ammunition on hand and by the ruleset limit", () => {
    expect(additionalHits({ margin: 20, recoil: 1, rof: 10, shotsAvailable: 4 })).toEqual({
      status: "resolved",
      hits: 3,
      cappedBy: "shots",
    });
    expect(
      additionalHits(
        { margin: 20, recoil: 1, rof: 10 },
        { ...defaultRuleset, weapon: { ...defaultRuleset.weapon, maxAdditionalHits: 2 } },
      ),
    ).toEqual({ status: "resolved", hits: 2, cappedBy: "limit" });
  });

  it("is explicitly unavailable when data is missing or the attack missed", () => {
    expect(additionalHits({ margin: 5, recoil: null, rof: 10 })).toEqual({
      status: "unavailable",
      reason: "no-recoil",
    });
    expect(additionalHits({ margin: 5, recoil: 2, rof: parseRoF("1/2") })).toEqual({
      status: "unavailable",
      reason: "no-rof",
    });
    expect(additionalHits({ margin: 5, recoil: 2, rof: 1 })).toEqual({
      status: "unavailable",
      reason: "not-rapid-fire",
    });
    expect(additionalHits({ margin: -1, recoil: 2, rof: 5 })).toEqual({
      status: "unavailable",
      reason: "miss",
    });
  });
});

describe("damage expression resolution", () => {
  it("rolls plain dice expressions and keeps the damage type", () => {
    const r = resolveDamageExpression("2d+1 cut");
    expect(r).toMatchObject({ status: "rollable", expression: "2d+1", damageType: "cut" });
  });

  it("is unavailable for thr/sw without a configured progression", () => {
    expect(resolveDamageExpression("sw+1 cr", { st: 12 })).toMatchObject({
      status: "unavailable",
      reason: "no-progression",
      raw: "sw+1 cr",
    });
    expect(resolveDamageExpression("thr", { st: 12 })).toMatchObject({
      status: "unavailable",
      reason: "no-progression",
    });
  });

  it("resolves deterministically once a progression is configured", () => {
    const swing = resolveDamageExpression("sw+1 cr", { st: 12, progression });
    expect(swing).toMatchObject({
      status: "rollable",
      expression: "1d+3",
      damageType: "cr",
      usedBasicDamage: true,
    });
    const thrust = resolveDamageExpression("thr imp", { st: 10, progression });
    expect(thrust).toMatchObject({ status: "rollable", expression: "1d-2", damageType: "imp" });
  });

  it("reports out-of-range ST rather than inventing a row", () => {
    expect(resolveDamageExpression("sw", { st: 5, progression })).toMatchObject({
      status: "unavailable",
      reason: "out-of-range",
    });
  });

  it("marks non-rollable text as unresolved", () => {
    expect(resolveDamageExpression("special").status).toBe("unresolved");
    expect(resolveDamageExpression("").status).toBe("unconfigured");
  });
});

describe("weapon normalization", () => {
  const mode = {
    name: "Sidearm",
    damage: "2d+2 pi",
    accuracy: "2",
    range: "160/1800",
    rof: "3",
    shots: "17(3)",
    bulk: "-2",
    recoil: "2",
    skill: "Guns",
  };

  it("produces typed values and session-local ammo", () => {
    const w = normalizeWeaponMode(mode, { st: 10 });
    expect(w.ranged).toBe(true);
    expect(w.ammo).toEqual({ capacity: 17, current: 17, reloadTime: 3 });
    expect(w.accuracy.value).toBe(2);
    expect(w.bulk.value).toBe(-2);
    expect(w.damage.status).toBe("rollable");
    expect(accuracyModifier(w, { aiming: true })).toBe(2);
    expect(accuracyModifier(w, { aiming: false })).toBe(0);
  });

  it("never yields a rollable thr/sw damage with the default ruleset", () => {
    const w = normalizeWeaponMode({ name: "Blade", damage: "sw+1 cr", reach: "1" }, { st: 12 });
    expect(w.damage.status).toBe("unavailable");
    expect(defaultRuleset.damageProgression).toBeNull();
  });

  it("does not mutate the weapon definition when ammo is consumed", () => {
    const w = normalizeWeaponMode(mode, { st: 10 });
    const fired = consumeShots(w.ammo!, 5);
    expect(fired.ok).toBe(true);
    expect(mode.shots).toBe("17(3)");
    expect(w.ammo!.current).toBe(17);
  });
});

describe("DR stacking policy", () => {
  const armour = (name: string, dr: number): CharacterEntry => ({
    id: name,
    kind: "equipment",
    name,
    points: 0,
    levels: 1,
    data: { quantity: 1, weight: 5, cost: 0, carried: true, dr, locations: ["Torso"] },
  });

  it("adds layers by default and honours the 'highest' policy", () => {
    const entries = [armour("Vest", 5), armour("Plate", 8)];
    expect(drByLocation(entries)).toEqual({ Torso: 13 });
    expect(drByLocation(entries, { ...defaultRuleset, drStacking: "highest" })).toEqual({
      Torso: 8,
    });
  });
});

describe("audit after phase B", () => {
  it("no longer lists weapon fields as a single MISSING area", () => {
    const ids = RULES_AUDIT.map((r) => r.id);
    expect(ids).not.toContain("combat.weapon-fields");
    for (const id of [
      "combat.weapon-parsing",
      "combat.damage-expression",
      "combat.ammo",
      "combat.rapid-fire",
      "combat.accuracy-bulk",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("reports zero approximations and only documented MISSING entries", () => {
    expect(RULES_AUDIT.filter((r) => r.status === "APPROXIMATION")).toEqual([]);
    expect(RULES_AUDIT.filter((r) => r.status === "MISSING").map((r) => r.id)).toEqual([]);
  });
});
