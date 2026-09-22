/**
 * Matching a character entry against content-pack items.
 *
 * The deterministic normalisation and qualifier parsing come from
 * `src/lib/trait-match.ts` — this module extends that infrastructure with the
 * pack-linking rules (specialisation awareness, "+2"/"(12)" noise, category
 * tie-breaks) instead of introducing a second, competing matcher.
 *
 * Reads are always performed with the caller's own RLS-scoped client, and the
 * campaign's allowed-pack list is applied with the existing
 * `allowedPacksOf` / `isPackAllowed` semantics.
 *
 * Classification: CONFIGURABLE (name reconciliation, not a game rule).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { allowedPacksOf, isPackAllowed } from "@/lib/packs";
import { normaliseName, rawQualifier } from "@/lib/trait-match";
import { normalizeText } from "@/lib/text-normalize";
import { rankSearch } from "@/lib/search";

import { packVersionOf, type PackItemLike } from "@/lib/pack-link";

export type PackClient = SupabaseClient<Database>;

export interface PackCandidate extends PackItemLike {
  id: string;
  kind: string;
  name: string;
  category: string | null;
  base_points: number;
  cost_per_level: number;
  max_levels: number | null;
  difficulty: string | null;
  attribute: string | null;
  defaults: string | null;
  prerequisites: string | null;
  specialization: string | null;
  specialization_required: boolean;
  pack: string | null;
  pack_id: string | null;
  pack_name: string | null;
  data: Record<string, unknown>;
  pack_version?: string;
}

export type MatchStatus = "unique" | "ambiguous" | "none";

export interface PackMatchResult {
  status: MatchStatus;
  item: PackCandidate | null;
  candidates: PackCandidate[];
  /** Specialisation inferred from the searched name, if any. */
  specialization: string;
}

export const MAX_MATCH_CANDIDATES = 10;

/* ------------------------------------------------------------------ */
/* Name parsing                                                        */
/* ------------------------------------------------------------------ */

/** Trailing "+2" / "-1" level noise, e.g. "Acute Vision +2". */
const TRAILING_LEVEL = /\s*[+-]\s*\d+\s*$/;

export interface ParsedSearchName {
  base: string;
  /** Normalised specialisation, empty when the qualifier is only noise. */
  qualifier: string;
  /** Specialisation exactly as typed, for storing in data.specialization. */
  rawQualifier: string;
}

/**
 * Splits a typed name into its base and its specialisation. A purely numeric
 * qualifier ("Bad Temper (12)") is a self-control number, not a
 * specialisation, so it is treated as noise in this first pass.
 */
export function parseSearchName(value: string): ParsedSearchName {
  const withoutLevel = value.replace(TRAILING_LEVEL, "");
  const raw = rawQualifier(withoutLevel);
  const numericOnly = raw !== "" && /^[\d\s,.-]+$/.test(raw);
  return {
    base: normaliseName(withoutLevel),
    qualifier: numericOnly ? "" : normalizeText(raw),
    rawQualifier: numericOnly ? "" : raw,
  };
}

function candidateQualifier(candidate: PackCandidate): string {
  const stored = candidate.specialization;
  if (typeof stored === "string" && stored.trim()) return normalizeText(stored);
  return normalizeText(rawQualifier(candidate.name));
}

/* ------------------------------------------------------------------ */
/* Pure matching                                                       */
/* ------------------------------------------------------------------ */

function narrowByCategory(rows: PackCandidate[], category?: string | null): PackCandidate[] {
  const wanted = normalizeText(category ?? "");
  if (!wanted) return rows;
  const narrowed = rows.filter((row) => normalizeText(row.category ?? "") === wanted);
  // A category never silently selects a different candidate: when it matches
  // nothing the untouched list is returned and the result stays ambiguous.
  return narrowed.length > 0 ? narrowed : rows;
}

function decide(
  rows: PackCandidate[],
  parsed: ParsedSearchName,
  category?: string | null,
): PackMatchResult {
  if (rows.length === 0) {
    return { status: "none", item: null, candidates: [], specialization: parsed.rawQualifier };
  }
  if (rows.length === 1) {
    return {
      status: "unique",
      item: rows[0]!,
      candidates: rows,
      specialization: parsed.rawQualifier,
    };
  }
  const narrowed = narrowByCategory(rows, category);
  if (narrowed.length === 1) {
    return {
      status: "unique",
      item: narrowed[0]!,
      candidates: narrowed,
      specialization: parsed.rawQualifier,
    };
  }
  return {
    status: "ambiguous",
    item: null,
    candidates: narrowed.slice(0, MAX_MATCH_CANDIDATES),
    specialization: parsed.rawQualifier,
  };
}

/**
 * Deterministic match of one typed entry against a candidate list.
 *
 * Order of attempts:
 *  1. same kind, same base name, same specialisation;
 *  2. same kind, same base name, candidate carries no specialisation of its own
 *     AND declares `specialization_required` — only such a row is a genuine
 *     "choose your specialisation" base item, so the typed specialisation may
 *     be attached to it and stored structurally. A plain generic row that says
 *     nothing about specialisations is NOT silently reused: pretending
 *     "Survival (Jungle)" is the unrelated generic "Survival" would invent a
 *     link the pack never declared.
 *  3. same kind, same base name, any specialisation (only when the search
 *     carried none);
 * a tie is narrowed by category and otherwise reported as ambiguous.
 */
export function matchPackCandidates(
  query: { kind: string; name: string; category?: string | null | undefined },
  rows: PackCandidate[],
): PackMatchResult {
  const parsed = parseSearchName(query.name);
  const sameKind = rows.filter((row) => row.kind === query.kind);
  const sameBase = sameKind.filter((row) => normaliseName(row.name) === parsed.base);
  if (sameBase.length === 0) {
    return { status: "none", item: null, candidates: [], specialization: parsed.rawQualifier };
  }

  const exact = sameBase.filter((row) => candidateQualifier(row) === parsed.qualifier);
  if (exact.length > 0) return decide(exact, parsed, query.category);

  if (parsed.qualifier) {
    const generic = sameBase.filter(
      (row) => candidateQualifier(row) === "" && row.specialization_required,
    );
    if (generic.length > 0) return decide(generic, parsed, query.category);
    // Remaining rows carry their own, different specialisation. They may be
    // offered as candidates to choose from, but a plain generic row is never
    // auto-selected for a specialised search.
    const specialised = sameBase.filter((row) => candidateQualifier(row) !== "");
    if (specialised.length === 0) {
      return { status: "none", item: null, candidates: [], specialization: parsed.rawQualifier };
    }
    return {
      status: "ambiguous",
      item: null,
      candidates: specialised.slice(0, MAX_MATCH_CANDIDATES),
      specialization: parsed.rawQualifier,
    };
  }

  return decide(sameBase, parsed, query.category);
}

/* ------------------------------------------------------------------ */
/* Loading candidates under the caller's own access                    */
/* ------------------------------------------------------------------ */

const CANDIDATE_COLUMNS =
  "id,owner_id,kind,name,category,summary,base_points,cost_per_level,max_levels,pack,data," +
  "source_label,source_edition,source_page,source_type,visibility";

interface LibraryCandidateRow {
  id: string;
  owner_id: string;
  kind: string;
  name: string;
  category: string | null;
  base_points: number;
  cost_per_level: number;
  max_levels: number | null;
  pack: string | null;
  data: unknown;
}

/** owner + pack name -> pack id, so a link can carry a stable pack identity. */
export async function loadPackIndex(
  client: PackClient,
): Promise<Map<string, { id: string; name: string }>> {
  const { data, error } = await client.from("content_packs").select("id,owner_id,name");
  if (error) throw new Error(error.message);
  const index = new Map<string, { id: string; name: string }>();
  for (const row of data ?? []) {
    index.set(`${row.owner_id}::${row.name.toLowerCase()}`, { id: row.id, name: row.name });
  }
  return index;
}

export function toCandidate(
  row: LibraryCandidateRow,
  packIndex: Map<string, { id: string; name: string }>,
): PackCandidate {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const packKey = `${row.owner_id}::${(row.pack ?? "").toLowerCase()}`;
  const pack = row.pack ? (packIndex.get(packKey) ?? null) : null;
  const str = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    category: row.category,
    base_points: Number(row.base_points ?? 0),
    cost_per_level: Number(row.cost_per_level ?? 0),
    max_levels:
      row.max_levels === null || row.max_levels === undefined ? null : Number(row.max_levels),
    difficulty: str(data["difficulty"]),
    attribute: str(data["attribute"]),
    defaults: str(data["defaults"]),
    prerequisites: str(data["prerequisites"]),
    specialization: str(data["specialization"]),
    specialization_required: data["specialization_required"] === true,
    pack: row.pack,
    pack_id: pack?.id ?? null,
    pack_name: pack?.name ?? row.pack,
    data,
  };
}

/** Adds the current canonical version to each candidate. */
export async function withVersions(candidates: PackCandidate[]): Promise<PackCandidate[]> {
  return Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      pack_version: await packVersionOf(candidate),
    })),
  );
}

export interface CandidateScope {
  /** Campaign settings of the character, when it belongs to one. */
  campaignSettings?: unknown;
  kind?: string | undefined;
  /** Optional free-text search applied to the name. */
  search?: string | undefined;
  packId?: string | undefined;
  limit?: number | undefined;
}

/** How many rows are pulled under RLS before an in-app text filter runs. */
const SEARCH_POOL = 2000;

/**
 * Pack items the caller may actually use.
 *
 * With a campaign the search is restricted to packs the campaign allows
 * (empty allow list = every accessible pack); without one, everything the
 * caller can see is searchable. RLS does the rest — nothing here can widen it.
 *
 * The free-text filter is applied in the app, not in SQL: the database has no
 * accent-insensitive comparison available here, so "sobrevivencia" would never
 * match "Sobrevivência". A bounded pool is read and ranked with the shared
 * accent-folding search helpers instead.
 */
export async function loadPackCandidates(
  client: PackClient,
  scope: CandidateScope = {},
): Promise<PackCandidate[]> {
  const packIndex = await loadPackIndex(client);
  const limit = scope.limit ?? 1000;
  let query = client.from("library_entries").select(CANDIDATE_COLUMNS).order("name");
  if (scope.kind) query = query.eq("kind", scope.kind);
  const { data, error } = await query.limit(scope.search ? Math.max(limit, SEARCH_POOL) : limit);
  if (error) throw new Error(error.message);

  const allowed = allowedPacksOf(scope.campaignSettings);
  const rows = (data ?? []) as unknown as LibraryCandidateRow[];
  let candidates = rows.map((row) => toCandidate(row, packIndex));
  if (scope.campaignSettings !== undefined) {
    candidates = candidates.filter((candidate) => isPackAllowed(candidate.pack, allowed));
  }
  if (scope.packId) candidates = candidates.filter((c) => c.pack_id === scope.packId);
  if (scope.search) {
    candidates = rankSearch(scope.search, candidates, (c) => ({
      name: c.name,
      fields: [c.category, c.specialization, c.pack],
    })).slice(0, limit);
  }
  return candidates;
}

/** Full match flow: load what the caller may use, then match deterministically. */
export async function findPackMatch(
  client: PackClient,
  query: { kind: string; name: string; category?: string | null | undefined },
  scope: CandidateScope = {},
): Promise<PackMatchResult> {
  const parsed = parseSearchName(query.name);
  const candidates = await loadPackCandidates(client, {
    ...scope,
    kind: query.kind,
    // The base name keeps translated/qualified variants in range.
    search: undefined,
  });
  const result = matchPackCandidates(query, candidates);
  return {
    ...result,
    item: result.item ? { ...result.item, pack_version: await packVersionOf(result.item) } : null,
    candidates: await withVersions(result.candidates),
    specialization: parsed.rawQualifier,
  };
}
