import { attributePoints, deriveStats, type DerivedStats } from "./attributes";
import { basicDamage, type BasicDamage } from "./damage";
import { computeEncumbrance, drByLocation, type EncumbranceResult } from "./equipment";
import { skillLevel } from "./skills";
import { investedPoints, isSkillLikeKind } from "./skill-points";
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

/** Removes the `-0` that arithmetic on negative costs can produce. */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Rounds .5 away from zero, so -7.5 -> -8 just as 7.5 -> 8. */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
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
  // "up"/"down" mean larger/smaller in magnitude, so they mirror for negatives.
  if (rules.modifierRounding === "up")
    return normalizeZero(base < 0 ? Math.floor(raw) : Math.ceil(raw));
  if (rules.modifierRounding === "down")
    return normalizeZero(base < 0 ? Math.ceil(raw) : Math.floor(raw));
  return normalizeZero(roundHalfAwayFromZero(raw));
}

export function entryCost(entry: CharacterEntry, rules: Ruleset = defaultRuleset): number {
  const modifiers = (entry.data?.modifiers as TraitModifier[] | undefined) ?? [];
  if (isSkillLikeKind(entry.kind)) {
    // Shared resolver: the UI, the MCP write paths and pack restore all agree
    // on this one value. See src/rules/skill-points.ts.
    return investedPoints(entry);
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
    (breakdown[bucket] as number) += entryCost(entry, rules);
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

export interface LimitViolation {
  limit: "pointBudget" | "disadvantageLimit" | "quirkLimit" | "techLevel";
  message: string;
  value: number;
  allowed: number;
}

/** Campaign caps. Reported, never silently enforced by mutating the sheet. */
export function checkLimits(
  character: CharacterRecord,
  breakdown: PointBreakdown,
  rules: Ruleset = defaultRuleset,
): LimitViolation[] {
  const out: LimitViolation[] = [];
  const l = rules.limits;
  if (l.pointBudget !== null && breakdown.total > l.pointBudget)
    out.push({
      limit: "pointBudget",
      message: "Point total exceeds the campaign budget.",
      value: breakdown.total,
      allowed: l.pointBudget,
    });
  if (l.disadvantageLimit !== null && breakdown.disadvantages < -Math.abs(l.disadvantageLimit))
    out.push({
      limit: "disadvantageLimit",
      message: "Disadvantage points exceed the campaign limit.",
      value: breakdown.disadvantages,
      allowed: -Math.abs(l.disadvantageLimit),
    });
  if (l.quirkLimit !== null && breakdown.quirks < -Math.abs(l.quirkLimit))
    out.push({
      limit: "quirkLimit",
      message: "Quirk points exceed the campaign limit.",
      value: breakdown.quirks,
      allowed: -Math.abs(l.quirkLimit),
    });
  if (l.techLevel !== null && character.tech_level > l.techLevel)
    out.push({
      limit: "techLevel",
      message: "Tech level exceeds the campaign setting.",
      value: character.tech_level,
      allowed: l.techLevel,
    });
  return out;
}

export interface CharacterSheet {
  stats: DerivedStats;
  points: PointBreakdown;
  encumbrance: EncumbranceResult;
  damage: BasicDamage;
  dr: Record<string, number>;
  skills: { entry: CharacterEntry; level: ReturnType<typeof skillLevel> }[];
  hp: HealthState;
  fp: HealthState;
  limits: LimitViolation[];
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
  // Two passes so skill defaults can reference other skills' levels.
  const skillEntries = entries.filter(
    (e) => e.kind === "skill" || e.kind === "technique" || e.kind === "spell",
  );
  const known: Record<string, number> = {};
  for (const entry of skillEntries) {
    const level = skillLevel(entry, stats, rules);
    if (level.effective !== null) known[entry.name] = level.effective;
  }
  const skills = skillEntries.map((entry) => ({
    entry,
    level: skillLevel(entry, stats, rules, { knownSkills: known }),
  }));
  return {
    stats,
    points,
    encumbrance,
    damage: basicDamage(stats.st, rules.damageProgression),
    dr: drByLocation(entries, rules),
    skills,
    hp: hpState(character.current_hp, stats.hp, rules),
    fp: fpState(character.current_fp, stats.fp, rules),
    limits: checkLimits(character, points, rules),
  };
}
