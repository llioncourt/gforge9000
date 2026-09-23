/**
 * Single source of truth for the point cost of a LEVELED non-skill trait
 * (advantage, disadvantage, perk, quirk, language, culture, custom).
 *
 * WHY THIS EXISTS
 * ---------------
 * Two conflicting conventions existed for `character_entries.points` on a
 * leveled trait:
 *
 *   - the rules engine multiplied: effective cost = points * levels;
 *   - the pack-link contract treats `points` as the TOTAL cost, because a
 *     per-level pack row prices every level (`cost_per_level * levels`).
 *
 * A restore therefore wrote the TOTAL into `points` while the engine kept
 * multiplying it by `levels` again, double-charging the character
 * (canonical 2/level at level 2 => stored 4 => engine charged 8).
 *
 * THE COMPATIBILITY RULE (deliberate, do not "simplify")
 * -----------------------------------------------------
 * A row-local marker in `data` states which convention the row uses:
 *
 *   data.trait_points_semantics === "total"  -> `points` IS the total cost.
 *                                               NEVER multiply by levels.
 *   marker absent (or anything else)         -> LEGACY per-level storage:
 *                                               cost = points * levels.
 *
 * Unmarked historical rows — linked or not — keep their legacy effective cost
 * until a user action explicitly touches them. There is no mass migration.
 * Every normalising write path (restore/update from pack, add from pack,
 * linking an existing row) converts storage to total semantics WITHOUT
 * changing the row's effective cost, and stamps the marker.
 *
 * The marker is character storage metadata / progression, never definition:
 * it is not part of `packDefinition` and never makes an entry "Modificada".
 *
 * Skill/technique/spell invested points are a SEPARATE concern and live in
 * `src/rules/skill-points.ts`; nothing here applies to them.
 *
 * Classification: CONFIGURABLE (storage convention, not a game rule). The
 * game rule itself — cost_per_level * levels — is unchanged and EXACT.
 */

import { isSkillLikeKind } from "./skill-points";

export const TRAIT_POINTS_SEMANTICS_KEY = "trait_points_semantics";

export type TraitPointsSemantics = "total" | "per_level";

export interface LeveledTraitLike {
  kind: string;
  points?: number | null | undefined;
  levels?: number | null | undefined;
  data?: Record<string, unknown> | null | undefined;
}

/** Kinds whose `points` historically multiplied by `levels`. */
export function usesLeveledPoints(kind: string): boolean {
  return !isSkillLikeKind(kind) && kind !== "equipment";
}

export function levelsOf(entry: LeveledTraitLike): number {
  const n = Number(entry.levels ?? 1);
  return Number.isFinite(n) && n > 1 ? n : 1;
}

/** Which storage convention this row uses. Unmarked rows stay legacy. */
export function traitPointsSemantics(entry: LeveledTraitLike): TraitPointsSemantics {
  const marker = (entry.data ?? {})[TRAIT_POINTS_SEMANTICS_KEY];
  return marker === "total" ? "total" : "per_level";
}

/** The trait's base cost BEFORE enhancement/limitation modifiers. */
export function traitBaseCost(entry: LeveledTraitLike): number {
  const points = Number(entry.points ?? 0) || 0;
  if (!usesLeveledPoints(entry.kind)) return points;
  return traitPointsSemantics(entry) === "total" ? points : points * levelsOf(entry);
}

/** Copy of `data` carrying the total-semantics marker. */
export function withTotalSemantics(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return { ...(data ?? {}), [TRAIT_POINTS_SEMANTICS_KEY]: "total" };
}

/**
 * Converts a row to total semantics while PRESERVING its effective base cost.
 *
 * `explicitTotal` is used when the caller already knows the canonical total
 * (a restore from the pack); otherwise the row's current effective cost is
 * kept, so linking a legacy `points=2, levels=2` row stores `points=4` and the
 * character's point total does not move.
 */
export function toTotalSemantics(
  entry: LeveledTraitLike,
  explicitTotal?: number | null | undefined,
): { points: number; data: Record<string, unknown> } {
  if (!usesLeveledPoints(entry.kind)) {
    return {
      points: Number(explicitTotal ?? entry.points ?? 0) || 0,
      data: { ...(entry.data ?? {}) },
    };
  }
  const total =
    explicitTotal === null || explicitTotal === undefined
      ? traitBaseCost(entry)
      : Number(explicitTotal) || 0;
  return { points: total, data: withTotalSemantics(entry.data) };
}
