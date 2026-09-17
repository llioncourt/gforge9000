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

/**
 * Relevance score for a result. Returns -1 when nothing matches.
 *
 * Name matches always outrank matches found only in descriptive text, so an
 * entry literally called like the query is never buried under entries that
 * merely mention those words in their summary.
 */
export function searchScore(
  query: string,
  name: string | null | undefined,
  fields: (string | null | undefined)[] = [],
): number {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return 0;
  const needle = tokens.join(" ");
  const haystackName = normaliseSearch(name ?? "");
  if (haystackName === needle) return 100;
  if (haystackName.startsWith(needle)) return 80;
  if (haystackName.includes(needle)) return 60;
  if (tokens.every((token) => haystackName.includes(token))) return 40;
  return matchesSearch(query, [name, ...fields]) ? 10 : -1;
}

/** Filters and sorts rows by relevance, keeping the original order within a tier. */
export function rankSearch<T>(
  query: string,
  rows: T[],
  select: (row: T) => { name: string | null | undefined; fields: (string | null | undefined)[] },
): T[] {
  if (searchTokens(query).length === 0) return rows;
  return rows
    .map((row, index) => {
      const { name, fields } = select(row);
      return { row, index, score: searchScore(query, name, fields) };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.row);
}
