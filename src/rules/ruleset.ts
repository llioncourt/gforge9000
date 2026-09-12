import type { Difficulty } from "./types";

/**
 * All configurable numbers live here. A campaign ruleset can override any of
 * these without changing calculation code — no magic numbers in components.
 */
export interface Ruleset {
  attributeCost: { ST: number; DX: number; IQ: number; HT: number };
  secondaryCost: { hp: number; will: number; per: number; fp: number; speed: number; move: number };
  /** Relative-level penalty applied to a skill's difficulty. */
  difficultyOffset: Record<Difficulty, number>;
  /** Basic Lift = st^2 / basicLiftDivisor (in pounds). */
  basicLiftDivisor: number;
  encumbrance: { label: string; multiplier: number; moveFactor: number; dodgePenalty: number }[];
  dodgeBase: number;
  criticalSuccessMax: number;
  criticalFailureMin: number;
  /** Margin at which a roll automatically fails regardless of target. */
  autoFailMargin: number;
}

export const defaultRuleset: Ruleset = {
  attributeCost: { ST: 10, DX: 20, IQ: 20, HT: 10 },
  secondaryCost: { hp: 2, will: 5, per: 5, fp: 3, speed: 20, move: 5 },
  difficultyOffset: { E: 0, A: -1, H: -2, VH: -3 },
  basicLiftDivisor: 5,
  encumbrance: [
    { label: "None", multiplier: 1, moveFactor: 1, dodgePenalty: 0 },
    { label: "Light", multiplier: 2, moveFactor: 0.8, dodgePenalty: -1 },
    { label: "Medium", multiplier: 3, moveFactor: 0.6, dodgePenalty: -2 },
    { label: "Heavy", multiplier: 6, moveFactor: 0.4, dodgePenalty: -3 },
    { label: "Extra-Heavy", multiplier: 10, moveFactor: 0.2, dodgePenalty: -4 },
  ],
  dodgeBase: 3,
  criticalSuccessMax: 4,
  criticalFailureMin: 17,
  autoFailMargin: 10,
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  E: "Easy",
  A: "Average",
  H: "Hard",
  VH: "Very Hard",
};
