import { defaultRuleset, type Ruleset } from "./ruleset";
import type { CharacterEntry, ControllingAttribute, Difficulty } from "./types";
import type { DerivedStats } from "./attributes";

/**
 * Relative level bought with `points` at a given difficulty.
 * 1 pt => +0, 2 pts => +1, 4 pts => +2, then +1 per additional 4 points.
 */
export function relativeLevel(
  points: number,
  difficulty: Difficulty,
  rules: Ruleset = defaultRuleset,
): number | null {
  if (points < 1) return null;
  let base: number;
  if (points < 2) base = 0;
  else if (points < 4) base = 1;
  else base = 2 + Math.floor((points - 4) / 4);
  return base + rules.difficultyOffset[difficulty];
}

export function attributeValue(attr: ControllingAttribute, stats: DerivedStats): number {
  switch (attr) {
    case "ST":
      return stats.st;
    case "DX":
      return stats.dx;
    case "IQ":
      return stats.iq;
    case "HT":
      return stats.ht;
    case "Will":
      return stats.will;
    case "Per":
      return stats.per;
  }
}

export interface SkillLevel {
  relative: number | null;
  effective: number | null;
  label: string;
}

export function skillLevel(
  entry: CharacterEntry,
  stats: DerivedStats,
  rules: Ruleset = defaultRuleset,
): SkillLevel {
  const attr = (entry.data.attribute as ControllingAttribute) ?? "DX";
  const difficulty = (entry.data.difficulty as Difficulty) ?? "A";
  const points = Number(entry.data.points ?? entry.points ?? 0);
  const bonus = Number(entry.data.bonus ?? 0);
  const rel = relativeLevel(points, difficulty, rules);
  const effective = rel === null ? null : attributeValue(attr, stats) + rel + bonus;
  const relText = rel === null ? "—" : rel >= 0 ? `+${rel}` : `${rel}`;
  return { relative: rel, effective, label: `${attr}${relText}` };
}

/** Points needed to reach a target relative level (inverse of relativeLevel). */
export function pointsForRelativeLevel(
  target: number,
  difficulty: Difficulty,
  rules: Ruleset = defaultRuleset,
): number {
  const base = target - rules.difficultyOffset[difficulty];
  if (base < 0) return 0;
  if (base === 0) return 1;
  if (base === 1) return 2;
  return 4 + (base - 2) * 4;
}
