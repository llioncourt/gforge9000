/** True when an entry was typed by hand rather than pulled from a pack. */
export function isCustomEntry(source: unknown): boolean {
  const s = (source ?? {}) as Record<string, unknown>;
  return !s["pack"];
}
