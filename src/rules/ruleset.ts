import type { DamageProgression } from "./damage";
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
  /** Rounding applied after enhancements/limitations. */
  modifierRounding: "nearest" | "up" | "down";
  /** Largest total limitation percentage honoured. */
  modifierFloorPercent: number;
  activeDefense: {
    parryDivisor: number;
    parryBase: number;
    blockDivisor: number;
    blockBase: number;
    retreatBonus: number;
  };
  technique: {
    /** Cost of the first level bought above the default. */
    firstLevelCost: Record<Difficulty, number>;
    /** Cost of each further level. */
    additionalLevelCost: Record<Difficulty, number>;
  };
  health: {
    hpThresholds: { atOrBelow: number; label: string; moveFactor: number }[];
    fpThresholds: { atOrBelow: number; label: string; moveFactor: number }[];
  };
  /**
   * Weapon/attack parameters. Nothing here encodes a published weapon table;
   * these only gate how declared weapon fields are consumed.
   */
  weapon: {
    /** Recoil values below this are treated as unusable. */
    minimumRecoil: number;
    /** Optional hard cap on extra hits from rapid fire. `null` = uncapped. */
    maxAdditionalHits: number | null;
    accuracyBonusEnabled: boolean;
    bulkPenaltyEnabled: boolean;
  };
  /** How DR from several pieces of armour on one location combines. */
  drStacking: "additive" | "highest";
  /** Campaign caps. `null` means no cap is enforced. */
  limits: {
    pointBudget: number | null;
    disadvantageLimit: number | null;
    quirkLimit: number | null;
    techLevel: number | null;
  };
  /**
   * Basic damage table. Intentionally empty: no published progression is
   * bundled. Install one from a user/licensed content pack.
   */
  damageProgression: DamageProgression | null;
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
  modifierRounding: "nearest",
  modifierFloorPercent: -80,
  activeDefense: { parryDivisor: 2, parryBase: 3, blockDivisor: 2, blockBase: 3, retreatBonus: 3 },
  technique: {
    firstLevelCost: { E: 1, A: 1, H: 2, VH: 2 },
    additionalLevelCost: { E: 1, A: 1, H: 1, VH: 1 },
  },
  health: {
    hpThresholds: [
      { atOrBelow: 1 / 3, label: "Reeling", moveFactor: 0.5 },
      { atOrBelow: 0, label: "Collapse risk", moveFactor: 0 },
      { atOrBelow: -1, label: "Death risk", moveFactor: 0 },
    ],
    fpThresholds: [
      { atOrBelow: 1 / 3, label: "Tired", moveFactor: 0.5 },
      { atOrBelow: 0, label: "Collapse risk", moveFactor: 0 },
    ],
  },
  weapon: {
    minimumRecoil: 1,
    maxAdditionalHits: null,
    accuracyBonusEnabled: true,
    bulkPenaltyEnabled: true,
  },
  drStacking: "additive",
  limits: { pointBudget: null, disadvantageLimit: null, quirkLimit: null, techLevel: null },
  damageProgression: null,
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> | T[K] : T[K] };

/** Campaign house rules: shallow-merges each section over the base ruleset. */
export function mergeRuleset(base: Ruleset, overrides?: DeepPartial<Ruleset> | null): Ruleset {
  if (!overrides) return base;
  const out = { ...base } as Ruleset;
  for (const key of Object.keys(overrides) as (keyof Ruleset)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    const current = base[key];
    if (Array.isArray(value) || value === null || typeof value !== "object") {
      (out as unknown as Record<string, unknown>)[key] = value;
    } else {
      (out as unknown as Record<string, unknown>)[key] = {
        ...(current as object),
        ...(value as object),
      };
    }
  }
  return out;
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  E: "Easy",
  A: "Average",
  H: "Hard",
  VH: "Very Hard",
};
