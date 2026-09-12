import { attributePoints, deriveStats, type DerivedStats } from "./attributes";
import { basicDamage, type BasicDamage } from "./damage";
import { computeEncumbrance, drByLocation, type EncumbranceResult } from "./equipment";
import { skillLevel } from "./skills";
import { fpState, hpState, type HealthState } from "./health";
import { defaultRuleset, type Ruleset } from "./ruleset";
import type { CharacterEntry, CharacterRecord, EntryKind, TraitModifier } from "./types";

export interface PointBreakdown {
  attributes: number;
  advantages: number;
  perks: number;
  disadvantages: number;
  quirks: number;
  skills: number;
  techniques: number;
  spells: number;
  other: number;
  total: number;
  remaining: number;
}

/** Applies enhancement/limitation percentages to a base cost. */
export function modifiedCost(
  base: number,
  modifiers: TraitModifier[] = [],
  rules: Ruleset = defaultRuleset,
): number {
  const percent = modifiers.reduce((sum, m) => sum + (Number(m.percent) || 0), 0);
  const clamped = Math.max(rules.modifierFloorPercent, percent);
  const raw = base * (1 + clamped / 100);
  if (rules.modifierRounding === "up") return base < 0 ? Math.floor(raw) : Math.ceil(raw);
  if (rules.modifierRounding === "down") return base < 0 ? Math.ceil(raw) : Math.floor(raw);
  return Math.round(raw);
}

export function entryCost(entry: CharacterEntry, rules: Ruleset = defaultRuleset): number {
  const modifiers = (entry.data?.modifiers as TraitModifier[] | undefined) ?? [];
  if (entry.kind === "skill" || entry.kind === "technique" || entry.kind === "spell") {
    return Number(entry.data?.points ?? entry.points ?? 0);
  }
  if (entry.kind === "equipment") return 0;
  const base = Number(entry.points ?? 0) * Math.max(1, Number(entry.levels ?? 1));
  return modifiers.length ? modifiedCost(base, modifiers, rules) : base;
}

const BUCKETS: Record<EntryKind, keyof PointBreakdown> = {
  advantage: "advantages",
  perk: "perks",
  disadvantage: "disadvantages",
  quirk: "quirks",
  skill: "skills",
  technique: "techniques",
  spell: "spells",
  equipment: "other",
  language: "other",
  culture: "other",
  custom: "other",
};

export function computePoints(
  character: CharacterRecord,
  entries: CharacterEntry[],
  rules: Ruleset = defaultRuleset,
): PointBreakdown {
  const breakdown: PointBreakdown = {
    attributes: attributePoints(character, rules),
    advantages: 0,
    perks: 0,
    disadvantages: 0,
    quirks: 0,
    skills: 0,
    techniques: 0,
    spells: 0,
    other: 0,
    total: 0,
    remaining: 0,
  };
  for (const entry of entries) {
    if (entry.kind === "equipment") continue;
    const bucket = BUCKETS[entry.kind] ?? "other";
    (breakdown[bucket] as number) += entryCost(entry);
  }
  breakdown.total =
    breakdown.attributes +
    breakdown.advantages +
    breakdown.perks +
    breakdown.disadvantages +
    breakdown.quirks +
    breakdown.skills +
    breakdown.techniques +
    breakdown.spells +
    breakdown.other;
  breakdown.remaining = character.point_budget - breakdown.total;
  return breakdown;
}

export interface CharacterSheet {
  stats: DerivedStats;
  points: PointBreakdown;
  encumbrance: EncumbranceResult;
  damage: { thrust: string; swing: string };
  dr: Record<string, number>;
  skills: { entry: CharacterEntry; level: ReturnType<typeof skillLevel> }[];
}

/** Single deterministic entry point used by every UI surface. */
export function buildSheet(
  character: CharacterRecord,
  entries: CharacterEntry[],
  rules: Ruleset = defaultRuleset,
): CharacterSheet {
  const stats = deriveStats(character, rules);
  const points = computePoints(character, entries, rules);
  const encumbrance = computeEncumbrance(
    entries,
    { basicLift: stats.basicLift, basicMove: stats.basicMove, dodge: stats.dodge },
    rules,
  );
  const skills = entries
    .filter((e) => e.kind === "skill" || e.kind === "technique" || e.kind === "spell")
    .map((entry) => ({ entry, level: skillLevel(entry, stats, rules) }));
  return {
    stats,
    points,
    encumbrance,
    damage: basicDamage(stats.st),
    dr: drByLocation(entries),
    skills,
  };
}
