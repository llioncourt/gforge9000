/**
 * Text search helpers shared by the library and pack pickers.
 *
 * Matching is accent- and case-insensitive and token based: every token of the
 * query must appear somewhere in the searchable text, in any order.
 *
 * Classification: CONFIGURABLE (UI search, not a game rule).
 */

export function normaliseSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchTokens(query: string): string[] {
  const normalised = normaliseSearch(query);
  return normalised ? normalised.split(" ") : [];
}

/** True when every token of the query appears in any of the given fields. */
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const haystack = normaliseSearch(fields.filter(Boolean).join(" "));
  return tokens.every((token) => haystack.includes(token));
}
