/**
 * Which assistant-written statements a game master is allowed to accept in one
 * pass, and which must be opened individually.
 *
 * A statement that reports a contradiction between sources is never offered for
 * bulk acceptance: deciding a conflict is a judgement call, not a checkbox.
 *
 * Classification: CONFIGURABLE (review workflow, not a game rule).
 */

export interface ReviewableFact {
  id: string;
  statement: string;
  provenance_type: string;
  canon_status: string;
  conflict_with?: unknown;
}

function hasConflict(fact: ReviewableFact): boolean {
  if (fact.provenance_type === "conflict") return true;
  const conflicts = fact.conflict_with;
  if (Array.isArray(conflicts)) return conflicts.length > 0;
  if (conflicts && typeof conflicts === "object") return Object.keys(conflicts).length > 0;
  return false;
}

export interface ReviewSplit<T extends ReviewableFact> {
  /** Pending statements that may be accepted from the review list. */
  reviewable: T[];
  /** Pending statements that must be settled one by one. */
  blocked: T[];
}

export function splitForReview<T extends ReviewableFact>(facts: T[]): ReviewSplit<T> {
  const pending = facts.filter((fact) => fact.canon_status === "needs_review");
  return {
    reviewable: pending.filter((fact) => !hasConflict(fact)),
    blocked: pending.filter(hasConflict),
  };
}

/** Keeps a selection honest: only ids that are actually acceptable survive. */
export function acceptableSelection<T extends ReviewableFact>(
  facts: T[],
  selected: Iterable<string>,
): string[] {
  const allowed = new Set(splitForReview(facts).reviewable.map((fact) => fact.id));
  const out: string[] = [];
  for (const id of selected) if (allowed.has(id) && !out.includes(id)) out.push(id);
  return out;
}
