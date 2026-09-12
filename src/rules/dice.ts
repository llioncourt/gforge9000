import { defaultRuleset, type Ruleset } from "./ruleset";

export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

/** Deterministic RNG for tests and reproducible rolls. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface DiceExpression {
  count: number;
  sides: number;
  modifier: number;
  multiplier: number;
}

/** Parses expressions like "3d6", "2d-1", "1d6+2", "4d6x2". */
export function parseDice(expr: string): DiceExpression | null {
  const m = /^\s*(\d*)d(\d*)\s*(?:([x*])\s*(\d+))?\s*([+-]\s*\d+)?\s*$/i.exec(expr);
  if (!m) return null;
  return {
    count: m[1] ? parseInt(m[1], 10) : 1,
    sides: m[2] ? parseInt(m[2], 10) : 6,
    modifier: m[5] ? parseInt(m[5].replace(/\s+/g, ""), 10) : 0,
    multiplier: m[4] ? parseInt(m[4], 10) : 1,
  };
}

export interface RollResult {
  dice: number[];
  total: number;
  expression: string;
}

export function rollExpression(expr: string, rng: Rng = defaultRng): RollResult | null {
  const parsed = parseDice(expr);
  if (!parsed) return null;
  const dice: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    dice.push(Math.floor(rng() * parsed.sides) + 1);
  }
  const sum = dice.reduce((a, b) => a + b, 0);
  return { dice, total: (sum + parsed.modifier) * parsed.multiplier, expression: expr };
}

export type Outcome =
  | "critical success"
  | "success"
  | "failure"
  | "critical failure";

export interface SuccessRoll extends RollResult {
  target: number;
  margin: number;
  outcome: Outcome;
}

export function resolveSuccess(
  total: number,
  target: number,
  rules: Ruleset = defaultRuleset,
): { margin: number; outcome: Outcome } {
  const margin = target - total;
  if (total <= rules.criticalSuccessMax) return { margin, outcome: "critical success" };
  if (total === 5 && target >= 15) return { margin, outcome: "critical success" };
  if (total === 6 && target >= 16) return { margin, outcome: "critical success" };
  if (total === 18) return { margin, outcome: "critical failure" };
  if (total === rules.criticalFailureMin && target <= 15)
    return { margin, outcome: "critical failure" };
  if (total - target >= rules.autoFailMargin) return { margin, outcome: "critical failure" };
  return { margin, outcome: total <= target ? "success" : "failure" };
}

/** Standard 3d6 success roll against a target number. */
export function rollSuccess(
  target: number,
  rng: Rng = defaultRng,
  rules: Ruleset = defaultRuleset,
): SuccessRoll {
  const roll = rollExpression("3d6", rng)!;
  const { margin, outcome } = resolveSuccess(roll.total, target, rules);
  return { ...roll, target, margin, outcome };
}
