import { describe, expect, it } from "vitest";

import { buildSheet, defaultRuleset, type CharacterEntry, type CharacterRecord } from "@/rules";
import {
  CAMPAIGN_RULESET_SETTING,
  RULESET_FIELDS,
  changedPaths,
  coerceFieldValue,
  getAtPath,
  overridesFromRuleset,
  rulesetFromSettings,
  setAtPath,
} from "@/rules/campaign-ruleset";

const character: CharacterRecord = {
  id: "c1",
  name: "Test",
  point_budget: 150,
  st: 12,
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

describe("campaign ruleset overrides", () => {
  it("falls back to the defaults with no overrides", () => {
    expect(rulesetFromSettings({})).toEqual(defaultRuleset);
    expect(rulesetFromSettings(null)).toEqual(defaultRuleset);
    expect(changedPaths(defaultRuleset)).toEqual([]);
  });

  it("every field path exists on the default ruleset", () => {
    for (const field of RULESET_FIELDS) {
      expect(getAtPath(defaultRuleset, field.path)).not.toBeUndefined();
    }
  });

  it("stores only the sections that differ", () => {
    const edited = setAtPath(defaultRuleset, "attributeCost.ST", 8);
    const overrides = overridesFromRuleset(edited);
    expect(Object.keys(overrides)).toEqual(["attributeCost"]);
    expect(overrides.attributeCost?.ST).toBe(8);
    expect(changedPaths(edited)).toEqual(["attributeCost.ST"]);
  });

  it("round-trips through campaign settings", () => {
    const edited = setAtPath(defaultRuleset, "basicLiftDivisor", 10);
    const settings = { [CAMPAIGN_RULESET_SETTING]: overridesFromRuleset(edited) };
    expect(rulesetFromSettings(settings).basicLiftDivisor).toBe(10);
    expect(rulesetFromSettings(settings).dodgeBase).toBe(defaultRuleset.dodgeBase);
  });

  it("does not mutate the source ruleset", () => {
    const edited = setAtPath(defaultRuleset, "activeDefense.parryBase", 5);
    expect(edited.activeDefense.parryBase).toBe(5);
    expect(defaultRuleset.activeDefense.parryBase).toBe(3);
  });

  it("coerces input and clamps to the declared bounds", () => {
    const attr = RULESET_FIELDS.find((f) => f.path === "attributeCost.ST")!;
    expect(coerceFieldValue(attr, "12.7")).toBe(12);
    expect(coerceFieldValue(attr, "-4")).toBe(0);
    expect(coerceFieldValue(attr, "abc")).toBeNull();

    const cap = RULESET_FIELDS.find((f) => f.path === "weapon.maxAdditionalHits")!;
    expect(coerceFieldValue(cap, "")).toBeNull();
    expect(coerceFieldValue(cap, "3")).toBe(3);

    const rounding = RULESET_FIELDS.find((f) => f.path === "modifierRounding")!;
    expect(coerceFieldValue(rounding, "up")).toBe("up");
    expect(coerceFieldValue(rounding, "sideways")).toBeNull();

    const flag = RULESET_FIELDS.find((f) => f.path === "weapon.accuracyBonusEnabled")!;
    expect(coerceFieldValue(flag, false)).toBe(false);
  });

  it("changes sheet output when the campaign overrides a value", () => {
    const entries: CharacterEntry[] = [];
    const base = buildSheet(character, entries);
    const rules = rulesetFromSettings({
      [CAMPAIGN_RULESET_SETTING]: overridesFromRuleset(setAtPath(defaultRuleset, "basicLiftDivisor", 10)),
    });
    const tuned = buildSheet(character, entries, rules);
    expect(tuned.stats.basicLift).toBeLessThan(base.stats.basicLift);
  });
});
