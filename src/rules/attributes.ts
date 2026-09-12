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
    basicLift: Math.round((c.st * c.st) / rules.basicLiftDivisor),
    dodge: Math.floor(basicSpeed) + rules.dodgeBase,
  };
}

/** Point cost of primary attributes and secondary adjustments. */
export function attributePoints(c: CharacterRecord, rules: Ruleset = defaultRuleset): number {
  const a = rules.attributeCost;
  const s = rules.secondaryCost;
  return (
    (c.st - 10) * a.ST +
    (c.dx - 10) * a.DX +
    (c.iq - 10) * a.IQ +
    (c.ht - 10) * a.HT +
    c.hp_delta * s.hp +
    c.will_delta * s.will +
    c.per_delta * s.per +
    c.fp_delta * s.fp +
    Math.round(Number(c.speed_delta ?? 0) * s.speed) +
    c.move_delta * s.move
  );
}

/**
 * Generic, configurable basic-damage formula. This is an original monotonic
 * approximation, not a reproduction of any published damage table.
 */
export function basicDamage(st: number): { thrust: string; swing: string } {
  const norm = (pips: number) => {
    let dice = 1;
    let mod = pips;
    while (mod >= 4) {
      dice += 1;
      mod -= 4;
    }
    return `${dice}d${mod === 0 ? "" : mod > 0 ? `+${mod}` : mod}`;
  };
  const clamped = Math.max(1, st);
  const thrPips = clamped <= 10 ? Math.floor((clamped - 1) / 2) - 6 : clamped - 12;
  const swPips = clamped <= 10 ? Math.floor((clamped - 1) / 2) - 5 : (clamped - 10) * 2 - 1;
  return { thrust: norm(thrPips), swing: norm(swPips) };
}
