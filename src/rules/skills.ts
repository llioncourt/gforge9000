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

const ATTRIBUTES: ControllingAttribute[] = ["ST", "DX", "IQ", "HT", "Will", "Per"];

export interface SkillDefault {
  /** Attribute name or another skill name. */
  from: string;
  penalty: number;
  isAttribute: boolean;
}

/** Parses "DX-5, IQ-4, Urban Navigation-2" into structured defaults. */
export function parseDefaults(spec?: string | null): SkillDefault[] {
  if (!spec) return [];
  return spec
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(.*?)\s*([+-]\s*\d+)?$/.exec(part);
      const from = (m?.[1] ?? part).trim();
      const penalty = m?.[2] ? parseInt(m[2].replace(/\s+/g, ""), 10) : 0;
      const isAttribute = ATTRIBUTES.some((a) => a.toLowerCase() === from.toLowerCase());
      return { from, penalty, isAttribute };
    })
    .filter((d) => d.from.length > 0);
}

export interface SkillContext {
  /** Effective levels of other skills, keyed by name (case-insensitive). */
  knownSkills?: Record<string, number> | undefined;
}

/** Best level obtainable from defaults, or null when none resolve. */
export function bestDefault(
  defaults: SkillDefault[],
  stats: DerivedStats,
  ctx: SkillContext = {},
): { level: number; from: SkillDefault } | null {
  const known = new Map(
    Object.entries(ctx.knownSkills ?? {}).map(([k, v]) => [k.toLowerCase(), v] as const),
  );
  let best: { level: number; from: SkillDefault } | null = null;
  for (const d of defaults) {
    let base: number | undefined;
    if (d.isAttribute) {
      const attr = ATTRIBUTES.find((a) => a.toLowerCase() === d.from.toLowerCase())!;
      base = attributeValue(attr, stats);
    } else {
      base = known.get(d.from.toLowerCase());
    }
    if (base === undefined) continue;
    const level = base + d.penalty;
    if (!best || level > best.level) best = { level, from: d };
  }
  return best;
}

export interface SkillLevel {
  relative: number | null;
  effective: number | null;
  label: string;
  /** True when the level comes from a default rather than purchased points. */
  fromDefault: boolean;
  defaultFrom: string | null;
}

export function skillLevel(
  entry: CharacterEntry,
  stats: DerivedStats,
  rules: Ruleset = defaultRuleset,
  ctx: SkillContext = {},
): SkillLevel {
  const attr = (entry.data.attribute as ControllingAttribute) ?? "DX";
  const difficulty = (entry.data.difficulty as Difficulty) ?? "A";
  const points = Number(entry.data.points ?? entry.points ?? 0);
  const bonus = Number(entry.data.bonus ?? 0);
  const rel = relativeLevel(points, difficulty, rules);
  const defaults = parseDefaults(entry.data.defaults as string | undefined);
  const fallback = bestDefault(defaults, stats, ctx);

  if (rel === null) {
    // Imported/licensed content may state a final level directly instead of points.
    // EXACT: the stated level is authoritative when no point purchase exists.
    const stated = entry.data['level'];
    if (stated !== undefined && stated !== null && Number.isFinite(Number(stated))) {
      return {
        relative: null,
        effective: Number(stated) + bonus,
        label: `${attr} (stated)`,
        fromDefault: false,
        defaultFrom: null,
      };
    }
    if (fallback) {
      return {
        relative: null,
        effective: fallback.level + bonus,
        label: `default ${fallback.from.from}${fallback.from.penalty ? fallback.from.penalty : ""}`,
        fromDefault: true,
        defaultFrom: fallback.from.from,
      };
    }
    return { relative: null, effective: null, label: `${attr}—`, fromDefault: false, defaultFrom: null };
  }

  const bought = attributeValue(attr, stats) + rel + bonus;
  // A purchased skill is never worse than its best default.
  const effective = fallback ? Math.max(bought, fallback.level + bonus) : bought;
  const relText = rel >= 0 ? `+${rel}` : `${rel}`;
  return { relative: rel, effective, label: `${attr}${relText}`, fromDefault: false, defaultFrom: null };
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

/**
 * Techniques improve a specific use of a base skill. Costs are CONFIGURABLE
 * (`rules.technique`); levels bought are capped by the technique's default
 * penalty when one is supplied.
 */
export function techniqueLevels(points: number, difficulty: Difficulty, rules: Ruleset = defaultRuleset): number {
  if (points < 1) return 0;
  const first = rules.technique.firstLevelCost[difficulty];
  const extra = Math.max(1, rules.technique.additionalLevelCost[difficulty]);
  if (points < first) return 0;
  return 1 + Math.floor((points - first) / extra);
}

export interface TechniqueLevel {
  levels: number;
  effective: number | null;
  capped: boolean;
  label: string;
}

export function techniqueLevel(
  entry: CharacterEntry,
  baseSkillLevel: number | null,
  rules: Ruleset = defaultRuleset,
): TechniqueLevel {
  const difficulty = (entry.data.difficulty as Difficulty) ?? "A";
  const points = Number(entry.data.points ?? entry.points ?? 0);
  const penalty = Number(entry.data.defaultPenalty ?? 0);
  const raw = techniqueLevels(points, difficulty, rules);
  const maxLevels = penalty < 0 ? Math.abs(penalty) : raw;
  const levels = Math.min(raw, maxLevels);
  const effective = baseSkillLevel === null ? null : baseSkillLevel + penalty + levels;
  return {
    levels,
    effective,
    capped: raw > levels,
    label: `${entry.data.baseSkill ?? "base"}${penalty ? penalty : ""}${levels ? `+${levels}` : ""}`,
  };
}
