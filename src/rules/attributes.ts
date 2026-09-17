import { defaultRuleset, type Ruleset } from "./ruleset";
import type { CharacterRecord } from "./types";

export interface DerivedStats {
  st: number;
  dx: number;
  iq: number;
  ht: number;
  hp: number;
  will: number;
  per: number;
  fp: number;
  basicSpeed: number;
  basicMove: number;
  basicLift: number;
  dodge: number;
}

/**
 * Basic Lift = ST^2 / divisor (divisor is ruleset-driven). The value keeps its
 * fractional precision (ST 11 with divisor 5 => 24.2); only binary floating
 * point noise is trimmed. Rounding for display is a UI concern, not a rule.
 */
export function basicLift(st: number, rules: Ruleset = defaultRuleset): number {
  const raw = (st * st) / rules.basicLiftDivisor;
  return Math.round(raw * 1e6) / 1e6;
}

/** Pure derivation of secondary characteristics from primary attributes. */
export function deriveStats(c: CharacterRecord, rules: Ruleset = defaultRuleset): DerivedStats {
  const basicSpeed = (c.dx + c.ht) / 4 + Number(c.speed_delta ?? 0);
  const basicMove = Math.max(0, Math.floor(basicSpeed) + c.move_delta);
  return {
    st: c.st,
    dx: c.dx,
    iq: c.iq,
    ht: c.ht,
    hp: c.st + c.hp_delta,
    will: c.iq + c.will_delta,
    per: c.iq + c.per_delta,
    fp: c.ht + c.fp_delta,
    basicSpeed,
    basicMove,
    basicLift: basicLift(c.st, rules),
    dodge: Math.floor(basicSpeed) + rules.dodgeBase,
  };
}

/**
 * Point cost of primary attributes and secondary adjustments.
 * Fractional costs (a quarter-step of Basic Speed under a non-default speed
 * cost) accumulate at full precision and are rounded once at the total.
 */
export function attributePoints(c: CharacterRecord, rules: Ruleset = defaultRuleset): number {
  const a = rules.attributeCost;
  const s = rules.secondaryCost;
  const total =
    (c.st - 10) * a.ST +
    (c.dx - 10) * a.DX +
    (c.iq - 10) * a.IQ +
    (c.ht - 10) * a.HT +
    c.hp_delta * s.hp +
    c.will_delta * s.will +
    c.per_delta * s.per +
    c.fp_delta * s.fp +
    Number(c.speed_delta ?? 0) * s.speed +
    c.move_delta * s.move;
  const rounded = total < 0 ? -Math.round(-total) : Math.round(total);
  return rounded === 0 ? 0 : rounded;
}

/**
 * Basic damage moved to ./damage.ts and is now data-driven (CONFIGURABLE).
 * The previous formula here was an invented approximation and was removed.
 */
export { basicDamage } from "./damage";
