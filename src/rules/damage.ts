/**
 * Basic damage is **data-driven**. The engine ships with NO damage progression
 * table: published tables are copyrighted, so an approximation would be a fake
 * formula presented as compatible behaviour. Instead a campaign (or a user
 * content pack) supplies a progression and the engine looks values up in it.
 *
 * Status: CONFIGURABLE. With no progression installed the result is
 * `{ status: "not-configured" }` and UI must show damage as unavailable.
 */
import type { SourceMeta } from "./types";

export interface DamageProgressionRow {
  /** Strength score this row applies to. */
  st: number;
  /** Thrust damage expression, e.g. "1d-2". */
  thrust: string;
  /** Swing damage expression, e.g. "1d". */
  swing: string;
}

export interface DamageProgression {
  id: string;
  label: string;
  source?: SourceMeta | undefined;
  /** Rows need not be sorted; lookup sorts defensively. */
  rows: DamageProgressionRow[];
}

export type DamageStatus = "configured" | "not-configured" | "out-of-range";

export interface BasicDamage {
  status: DamageStatus;
  thrust: string | null;
  swing: string | null;
  /** Progression label used, when configured. */
  source: string | null;
}

export const UNAVAILABLE_DAMAGE: BasicDamage = {
  status: "not-configured",
  thrust: null,
  swing: null,
  source: null,
};

export interface ProgressionIssue {
  row: number;
  message: string;
}

const EXPRESSION = /^\s*\d*d\d*\s*(?:[x*]\s*\d+)?\s*(?:[+-]\s*\d+)?\s*$/i;

/** Validates a user-supplied progression before it is stored or used. */
export function validateDamageProgression(p: DamageProgression): ProgressionIssue[] {
  const issues: ProgressionIssue[] = [];
  if (!p.rows.length) issues.push({ row: -1, message: "Progression has no rows." });
  const seen = new Set<number>();
  p.rows.forEach((row, i) => {
    if (!Number.isFinite(row.st)) issues.push({ row: i, message: "ST must be a number." });
    if (seen.has(row.st)) issues.push({ row: i, message: `Duplicate row for ST ${row.st}.` });
    seen.add(row.st);
    if (!EXPRESSION.test(row.thrust))
      issues.push({ row: i, message: `Invalid thrust "${row.thrust}".` });
    if (!EXPRESSION.test(row.swing))
      issues.push({ row: i, message: `Invalid swing "${row.swing}".` });
  });
  return issues;
}

/**
 * Looks up basic damage for a ST score. Exact match wins; otherwise the
 * highest row at or below ST is used and the result is flagged out-of-range
 * when ST falls below the lowest configured row.
 */
export function basicDamage(st: number, progression?: DamageProgression | null): BasicDamage {
  if (!progression || !progression.rows.length) return UNAVAILABLE_DAMAGE;
  const rows = [...progression.rows].sort((a, b) => a.st - b.st);
  let match: DamageProgressionRow | null = null;
  for (const row of rows) {
    if (row.st <= st) match = row;
    else break;
  }
  if (!match)
    return { status: "out-of-range", thrust: null, swing: null, source: progression.label };
  const last = rows[rows.length - 1]!;
  return {
    status: st > last.st ? "out-of-range" : "configured",
    thrust: match.thrust,
    swing: match.swing,
    source: progression.label,
  };
}
