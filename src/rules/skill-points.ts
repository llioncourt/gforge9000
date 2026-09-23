/**
 * Single source of truth for "invested points" on skill-like entries.
 *
 * WHY THIS EXISTS
 * ---------------
 * A `character_entries` row has TWO writable representations of the points a
 * player invested in a skill, technique or spell:
 *
 *   - the top-level `points` column, and
 *   - `data.points` inside the JSONB bag.
 *
 * Historically the sheet UI and the import guides wrote `data.points` for
 * skill-like kinds and left the column at 0, while the MCP
 * `update_character_entry` tool wrote only the column. The rules engine read
 * `data.points ?? points`, so an MCP points change was silently ignored
 * whenever a stale `data.points` shadow existed. That is the bug a real
 * MCP client reported.
 *
 * COMPATIBILITY RULE (deliberate, do not "simplify")
 * -------------------------------------------------
 * `investedPoints()` resolves the two representations like this:
 *
 *   1. Only one of them is a finite number  -> that one wins.
 *   2. They agree                            -> that value.
 *   3. They diverge AND the entry is linked to a content pack
 *                                            -> the top-level column wins,
 *      because an explicit MCP/API points write is authoritative and the
 *      `data.points` shadow must not override it.
 *   4. They diverge and the entry is NOT linked
 *                                            -> `data.points` wins, which
 *      preserves the effective value of every legacy sheet written before
 *      this fix (those rows typically have `points = 0` and a meaningful
 *      `data.points`). No mass migration is performed.
 *
 * Divergence can only survive on rows that are never touched again: every
 * write path now calls `syncInvestedPoints()` and persists the SAME value to
 * both representations, so a touched row stops being ambiguous.
 *
 * Invested points are PROGRESSION, not definition: they never make a
 * pack-linked entry count as "modified".
 */

export const SKILL_LIKE_KINDS = ["skill", "technique", "spell"] as const;

export function isSkillLikeKind(kind: string | null | undefined): boolean {
  return kind === "skill" || kind === "technique" || kind === "spell";
}

/** Anything shaped enough like a character entry to resolve its points. */
export interface InvestedPointsInput {
  kind: string;
  points?: number | null | undefined;
  data?: Record<string, unknown> | null | undefined;
  source?: unknown;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when the provenance bag carries a content-pack link. Kept local to the
 * rules engine on purpose: `src/rules` must not depend on app/service code.
 */
export function hasPackLink(source: unknown): boolean {
  if (!source || typeof source !== "object") return false;
  const link = (source as Record<string, unknown>)["link"];
  return Boolean(link && typeof link === "object");
}

/** The points the player actually invested. See the rule table above. */
export function investedPoints(entry: InvestedPointsInput): number {
  if (!isSkillLikeKind(entry.kind)) return finite(entry.points) ?? 0;
  const shadow = finite(entry.data?.["points"]);
  const column = finite(entry.points);
  if (shadow === null) return column ?? 0;
  if (column === null) return shadow;
  if (shadow === column) return shadow;
  return hasPackLink(entry.source) ? column : shadow;
}

/**
 * Normalises a write so both representations carry the same value.
 *
 * `explicit` is the value the caller asked for; when omitted the entry's
 * current effective value is kept. Every other `data` key is preserved.
 */
export function syncInvestedPoints(
  entry: InvestedPointsInput,
  explicit?: number | null | undefined,
): { points: number; data: Record<string, unknown> } {
  const base = { ...(entry.data ?? {}) };
  if (!isSkillLikeKind(entry.kind)) {
    return { points: finite(explicit) ?? finite(entry.points) ?? 0, data: base };
  }
  const value = finite(explicit) ?? investedPoints(entry);
  base["points"] = value;
  return { points: value, data: base };
}
