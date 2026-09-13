/**
 * Trait reconciliation for character imports (pure helpers).
 *
 * When a character file is imported, each of its entries is compared against
 * the content the user actually has enabled (their library, gated by the
 * allowed-pack list). Anything that matches is rewritten to the canonical
 * library entry so points, category and data come from the enabled pack.
 *
 * Matching is deterministic first (exact / normalised name). Only the
 * leftovers are handed to the AI, which mostly has to deal with translated
 * names. Whatever the AI cannot resolve is kept exactly as imported — the
 * import never fails and never nags the user about it.
 *
 * Classification: CONFIGURABLE (name reconciliation, not a game rule).
 */
import { isPackAllowed } from "@/lib/packs";

export interface CatalogueEntry {
  kind: string;
  name: string;
  category: string | null;
  base_points: number;
  cost_per_level: number;
  summary: string | null;
  data: Record<string, unknown> | null;
  pack: string | null;
  source_label?: string | null;
  source_edition?: string | null;
  source_page?: string | null;
  source_type?: string | null;
}

export interface ImportedEntry {
  kind: string;
  name: string;
  category?: string | null | undefined;
  points: number;
  levels: number;
  data?: Record<string, unknown> | null | undefined;
  notes?: string | null | undefined;
  source?: Record<string, unknown> | null | undefined;
  [key: string]: unknown;
}

/** Kinds that come from content packs; equipment/notes are free-form. */
export const MATCHABLE_KINDS = ["advantage", "disadvantage", "perk", "quirk", "skill", "technique", "spell"];

export function normaliseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Library rows the user may actually use, indexed by kind + normalised name. */
export function buildCatalogue(rows: CatalogueEntry[], allowedPacks: string[]): CatalogueEntry[] {
  return rows.filter((row) => isPackAllowed(row.pack, allowedPacks));
}

function keyOf(kind: string, name: string): string {
  return `${kind}::${normaliseName(name)}`;
}

export function catalogueIndex(rows: CatalogueEntry[]): Map<string, CatalogueEntry> {
  const index = new Map<string, CatalogueEntry>();
  for (const row of rows) {
    const key = keyOf(row.kind, row.name);
    if (!index.has(key)) index.set(key, row);
  }
  return index;
}

export function isMatchable(entry: ImportedEntry): boolean {
  return MATCHABLE_KINDS.includes(entry.kind);
}

/** Deterministic pass: exact or normalised name match inside the same kind. */
export function matchLocally(
  entry: ImportedEntry,
  index: Map<string, CatalogueEntry>,
): CatalogueEntry | null {
  if (!isMatchable(entry)) return null;
  return index.get(keyOf(entry.kind, entry.name)) ?? null;
}

export interface UnmatchedItem {
  kind: string;
  name: string;
}

/** Entries the deterministic pass could not place, de-duplicated. */
export function unmatchedItems(
  entries: ImportedEntry[],
  index: Map<string, CatalogueEntry>,
): UnmatchedItem[] {
  const seen = new Set<string>();
  const out: UnmatchedItem[] = [];
  for (const entry of entries) {
    if (!isMatchable(entry)) continue;
    if (matchLocally(entry, index)) continue;
    const key = keyOf(entry.kind, entry.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: entry.kind, name: entry.name });
  }
  return out;
}

/** Candidate names offered to the model, limited to the kinds still missing. */
export function candidatesFor(
  rows: CatalogueEntry[],
  items: UnmatchedItem[],
  limit = 400,
): UnmatchedItem[] {
  const kinds = new Set(items.map((i) => i.kind));
  const out: UnmatchedItem[] = [];
  for (const row of rows) {
    if (!kinds.has(row.kind)) continue;
    out.push({ kind: row.kind, name: row.name });
    if (out.length >= limit) break;
  }
  return out;
}

export function buildMatchPrompt(items: UnmatchedItem[], candidates: UnmatchedItem[]): string {
  const list = items.map((i, n) => `${n + 1}. [${i.kind}] ${i.name}`).join("\n");
  const options = candidates.map((c) => `- [${c.kind}] ${c.name}`).join("\n");
  return [
    "You reconcile imported tabletop character traits against a library of available content.",
    "Each imported item may be a translation, an abbreviation or a spelling variant of a library entry.",
    "",
    "Imported items:",
    list,
    "",
    "Library entries available (the only valid targets):",
    options,
    "",
    "For every imported item return the library entry that means the same thing.",
    "The match must have the same kind and the same meaning — a translation counts as the same meaning.",
    "If you are not confident, return an empty string for that item. Never invent a library name.",
    "Copy library names character for character.",
  ].join("\n");
}

export interface MatchResolution {
  source: string;
  kind: string;
  match: string;
}

/** Keeps only AI answers that point at a real catalogue entry of the same kind. */
export function resolveMatches(
  resolutions: MatchResolution[],
  index: Map<string, CatalogueEntry>,
): Map<string, CatalogueEntry> {
  const out = new Map<string, CatalogueEntry>();
  for (const r of resolutions) {
    if (!r || typeof r.match !== "string" || !r.match.trim()) continue;
    const target = index.get(keyOf(r.kind, r.match));
    if (!target) continue;
    out.set(keyOf(r.kind, r.source), target);
  }
  return out;
}

/**
 * Rewrites an imported entry onto a catalogue entry, keeping the character's
 * own numbers (levels, chosen data) but taking identity and provenance from
 * the enabled pack.
 */
export function applyCatalogue(entry: ImportedEntry, target: CatalogueEntry): ImportedEntry {
  const levels = Number(entry.levels ?? 1) || 1;
  const perLevel = Number(target.cost_per_level ?? 0);
  const base = Number(target.base_points ?? 0);
  const points =
    entry.kind === "skill" || entry.kind === "technique" || entry.kind === "spell"
      ? entry.points
      : perLevel
        ? base + perLevel * (levels - 1)
        : base;
  return {
    ...entry,
    name: target.name,
    category: target.category ?? entry.category ?? null,
    points,
    data: { ...(target.data ?? {}), ...(entry.data ?? {}) },
    source: {
      label: target.source_label ?? "Library",
      edition: target.source_edition ?? "",
      page: target.source_page ?? "",
      type: target.source_type ?? "user",
      pack: target.pack ?? null,
      imported_as: entry.name !== target.name ? entry.name : undefined,
    },
  };
}

export interface ReconcileResult {
  entries: ImportedEntry[];
  matched: number;
  unmatched: number;
}

/** Final pass: applies deterministic and AI matches; leftovers stay untouched. */
export function reconcileEntries(
  entries: ImportedEntry[],
  index: Map<string, CatalogueEntry>,
  aiMatches: Map<string, CatalogueEntry> = new Map(),
): ReconcileResult {
  let matched = 0;
  let unmatched = 0;
  const out = entries.map((entry) => {
    if (!isMatchable(entry)) return entry;
    const target = matchLocally(entry, index) ?? aiMatches.get(keyOf(entry.kind, entry.name));
    if (!target) {
      unmatched += 1;
      return entry;
    }
    matched += 1;
    return applyCatalogue(entry, target);
  });
  return { entries: out, matched, unmatched };
}
