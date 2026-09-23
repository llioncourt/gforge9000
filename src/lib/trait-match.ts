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
import { normalizeText } from "@/lib/text-normalize";

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
export const MATCHABLE_KINDS = [
  "advantage",
  "disadvantage",
  "perk",
  "quirk",
  "skill",
  "technique",
  "spell",
];

/** The bare trait name, with any parenthetical qualifier removed. */
export function normaliseName(value: string): string {
  return normalizeText(value.replace(/\(.*?\)/g, " "));
}

/** The raw text inside parentheses, e.g. "Pistol" in "Guns (Pistol)". */
export function rawQualifier(value: string): string {
  const found = [...value.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!.trim()).filter(Boolean);
  return found.join(", ");
}

/**
 * Specialisation / self-control qualifiers are part of a trait's identity:
 * `Guns (Pistol)` is not `Guns (Rifle)` and `Bad Temper (12)` is not
 * `Bad Temper (6)`. They are therefore kept in the match key instead of being
 * stripped.
 */
export function parseTraitName(value: string): { base: string; qualifier: string } {
  return { base: normaliseName(value), qualifier: normalizeText(rawQualifier(value)) };
}

/** Library rows the user may actually use, indexed by kind + normalised name. */
export function buildCatalogue(rows: CatalogueEntry[], allowedPacks: string[]): CatalogueEntry[] {
  return rows.filter((row) => isPackAllowed(row.pack, allowedPacks));
}

function keyOf(kind: string, name: string): string {
  const { base, qualifier } = parseTraitName(name);
  return qualifier ? `${kind}::${base}::${qualifier}` : `${kind}::${base}`;
}

function baseKeyOf(kind: string, name: string): string {
  return `${kind}::${parseTraitName(name).base}`;
}

/**
 * Lookup structure for the deterministic pass.
 *
 * `exact` is keyed by kind + base + qualifier, so `Guns (Pistol)` and
 * `Guns (Rifle)` are different keys and can never bind to one another.
 * `generic` holds only catalogue rows with no qualifier at all, and
 * `qualifiedCount` records how many qualified variants exist per base, which is
 * what makes the "fall back to the generic row" decision unambiguous.
 */
export interface CatalogueIndex {
  exact: Map<string, CatalogueEntry>;
  generic: Map<string, CatalogueEntry>;
  qualifiedCount: Map<string, number>;
}

export function catalogueIndex(rows: CatalogueEntry[]): CatalogueIndex {
  const exact = new Map<string, CatalogueEntry>();
  const generic = new Map<string, CatalogueEntry>();
  const qualifiedCount = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row.kind, row.name);
    if (!exact.has(key)) exact.set(key, row);
    const baseKey = baseKeyOf(row.kind, row.name);
    if (parseTraitName(row.name).qualifier) {
      qualifiedCount.set(baseKey, (qualifiedCount.get(baseKey) ?? 0) + 1);
    } else if (!generic.has(baseKey)) {
      generic.set(baseKey, row);
    }
  }
  return { exact, generic, qualifiedCount };
}

export function isMatchable(entry: ImportedEntry): boolean {
  return MATCHABLE_KINDS.includes(entry.kind);
}

/**
 * Deterministic pass: exact match on kind + base name + qualifier.
 *
 * A qualified import (`Guns (Pistol)`) may fall back to a *generic* catalogue
 * row (`Guns`) only when such a row exists and the catalogue carries no
 * qualified variants of that base — otherwise the correct variant is a guess
 * and the entry is left unmatched for explicit resolution. An unqualified
 * import never binds to a qualified row.
 */
export function matchLocally(entry: ImportedEntry, index: CatalogueIndex): CatalogueEntry | null {
  if (!isMatchable(entry)) return null;
  const exact = index.exact.get(keyOf(entry.kind, entry.name));
  if (exact) return exact;
  const { qualifier } = parseTraitName(entry.name);
  if (!qualifier) return null;
  const baseKey = baseKeyOf(entry.kind, entry.name);
  if ((index.qualifiedCount.get(baseKey) ?? 0) > 0) return null;
  return index.generic.get(baseKey) ?? null;
}

export interface UnmatchedItem {
  kind: string;
  name: string;
}

/** Entries the deterministic pass could not place, de-duplicated. */
export function unmatchedItems(entries: ImportedEntry[], index: CatalogueIndex): UnmatchedItem[] {
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
  index: CatalogueIndex,
): Map<string, CatalogueEntry> {
  const out = new Map<string, CatalogueEntry>();
  for (const r of resolutions) {
    if (!r || typeof r.match !== "string" || !r.match.trim()) continue;
    const target = index.exact.get(keyOf(r.kind, r.match));
    if (!target) continue;
    out.set(keyOf(r.kind, r.source), target);
  }
  return out;
}

/**
 * How a match treats the entry's existing `source` bag.
 *
 * Ordinary character imports rebuild provenance from the library row they
 * matched (the historic behaviour). A campaign package, by contrast, carries
 * its own historical provenance, which is authoritative: nothing in it may be
 * replaced or dropped by reconciliation.
 */
export interface ReconcileOptions {
  preserveSourceProvenance?: boolean;
}

/**
 * Rewrites an imported entry onto a catalogue entry, keeping the character's
 * own numbers (levels, chosen data) but taking identity and provenance from
 * the enabled pack.
 */
export function applyCatalogue(
  entry: ImportedEntry,
  target: CatalogueEntry,
  options: ReconcileOptions = {},
): ImportedEntry {
  const levels = Number(entry.levels ?? 1) || 1;
  const perLevel = Number(target.cost_per_level ?? 0);
  const base = Number(target.base_points ?? 0);
  const points =
    entry.kind === "skill" || entry.kind === "technique" || entry.kind === "spell"
      ? entry.points
      : perLevel
        ? base + perLevel * (levels - 1)
        : base;
  // A specialisation the library entry does not carry must survive the rewrite.
  const importedQualifier = rawQualifier(entry.name);
  const name =
    importedQualifier && !rawQualifier(target.name)
      ? `${target.name} (${importedQualifier})`
      : target.name;
  const specialization =
    importedQualifier && (entry.data?.["specialization"] ?? "") === ""
      ? { specialization: importedQualifier }
      : {};
  const previousSource =
    entry.source && typeof entry.source === "object"
      ? (entry.source as Record<string, unknown>)
      : {};
  const previousLink = previousSource["link"];

  // Preserve mode: the imported bag wins key by key, including keys this code
  // knows nothing about. A provenance key is only filled in when it is truly
  // absent, and `link` is never touched.
  const source = options.preserveSourceProvenance
    ? {
        label: previousSource["label"] ?? target.source_label ?? "Library",
        edition: previousSource["edition"] ?? target.source_edition ?? "",
        page: previousSource["page"] ?? target.source_page ?? "",
        type: previousSource["type"] ?? target.source_type ?? "user",
        pack: "pack" in previousSource ? previousSource["pack"] : (target.pack ?? null),
        ...(entry.name !== name && previousSource["imported_as"] === undefined
          ? { imported_as: entry.name }
          : {}),
        ...previousSource,
      }
    : {
        label: target.source_label ?? "Library",
        edition: target.source_edition ?? "",
        page: target.source_page ?? "",
        type: target.source_type ?? "user",
        pack: target.pack ?? null,
        imported_as: entry.name !== name ? entry.name : undefined,
        // An existing content-pack link is provenance the rewrite must not
        // destroy; it is the only key of the old source that survives.
        ...(previousLink ? { link: previousLink } : {}),
      };

  return {
    ...entry,
    name,
    category: target.category ?? entry.category ?? null,
    points,
    data: { ...(target.data ?? {}), ...(entry.data ?? {}), ...specialization },
    source,
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
  index: CatalogueIndex,
  aiMatches: Map<string, CatalogueEntry> = new Map(),
  options: ReconcileOptions = {},
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
    return applyCatalogue(entry, target, options);
  });
  return { entries: out, matched, unmatched };
}
