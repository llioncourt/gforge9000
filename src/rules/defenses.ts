/**
 * Active defences. Dodge derives from Basic Speed (see attributes.ts); Parry
 * and Block derive from a weapon/shield skill level with configurable divisor
 * and base. All numbers live in the ruleset — no magic constants here.
 */
import { defaultRuleset, type Ruleset } from "./ruleset";

export interface ActiveDefense {
  kind: "dodge" | "parry" | "block";
  value: number | null;
  label: string;
}

export function parryFromSkill(
  skillLevel: number | null,
  rules: Ruleset = defaultRuleset,
  bonus = 0,
): number | null {
  if (skillLevel === null) return null;
  const d = rules.activeDefense;
  return Math.floor(skillLevel / d.parryDivisor) + d.parryBase + bonus;
}

export function blockFromSkill(
  skillLevel: number | null,
  rules: Ruleset = defaultRuleset,
  bonus = 0,
): number | null {
  if (skillLevel === null) return null;
  const d = rules.activeDefense;
  return Math.floor(skillLevel / d.blockDivisor) + d.blockBase + bonus;
}

/** Applies the configurable retreat bonus to any active defence. */
export function withRetreat(value: number | null, rules: Ruleset = defaultRuleset): number | null {
  return value === null ? null : value + rules.activeDefense.retreatBonus;
}

/** Encumbrance already penalises Dodge; this keeps the rounding in one place. */
export function encumberedDodge(dodge: number, penalty: number): number {
  return Math.max(0, dodge + penalty);
}
