/**
 * Deciding what to do when a record changes on the server while someone is
 * still typing into it.
 *
 * Unsaved text must never be replaced silently. A refresh is only applied when
 * the local copy is untouched; otherwise the editor keeps what the person wrote
 * and is told that a newer version exists.
 *
 * Classification: CONFIGURABLE (editing workflow, not a game rule).
 */

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** True when the editor holds edits that were never sent to the server. */
export function hasLocalChanges(baseline: unknown, current: unknown): boolean {
  if (!baseline || !current) return false;
  return stableStringify(baseline) !== stableStringify(current);
}

export type SyncDecision = "apply" | "keep-local" | "noop";

/**
 * `apply` — take the server copy.
 * `keep-local` — the person has unsaved edits and the server moved on.
 * `noop` — nothing to do.
 */
export function decideSync(
  baseline: unknown,
  current: unknown,
  incoming: unknown,
): SyncDecision {
  if (!incoming) return "noop";
  if (!current) return "apply";
  if (!hasLocalChanges(baseline, current)) {
    return hasLocalChanges(current, incoming) ? "apply" : "noop";
  }
  return hasLocalChanges(baseline, incoming) ? "keep-local" : "noop";
}
