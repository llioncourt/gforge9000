/**
 * Optional pack linking for character entries (pure logic).
 *
 * A character entry may optionally declare that it is a copy of a specific
 * content-pack item. That linkage lives at `character_entries.source.link`
 * and NOTHING else in `source` is touched: `label`, `edition`, `page`,
 * `type`, `pack` and `imported_as` are provenance and survive every operation
 * in this module.
 *
 * An entry with no `source.link` is "custom" (shown as "Casa" in pt-BR). That
 * is not the same as an empty `source`.
 *
 * Classification: CONFIGURABLE — this is bookkeeping about where content came
 * from, not a game rule. No calculation in `src/rules` depends on it.
 */

import { normalizeText } from "@/lib/text-normalize";
import { normaliseName, rawQualifier } from "@/lib/trait-match";

/* ------------------------------------------------------------------ */
/* The link record                                                     */
/* ------------------------------------------------------------------ */

export type PackLinkMethod = "manual" | "match_name" | "ui_picker";

export interface PackLink {
  pack_id: string;
  pack_name: string;
  pack_entry_id: string;
  pack_version: string;
  linked_at: string;
  link_method: PackLinkMethod;
}

const LINK_METHODS: PackLinkMethod[] = ["manual", "match_name", "ui_picker"];

export type SourceBag = Record<string, unknown>;

export function asSourceBag(source: unknown): SourceBag {
  return source && typeof source === "object" && !Array.isArray(source)
    ? { ...(source as SourceBag) }
    : {};
}

/** The link record on an entry's `source`, or null when the entry is custom. */
export function readPackLink(source: unknown): PackLink | null {
  const bag = asSourceBag(source);
  const raw = bag["link"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const link = raw as Record<string, unknown>;
  const str = (key: string): string =>
    typeof link[key] === "string" ? (link[key] as string).trim() : "";
  const pack_entry_id = str("pack_entry_id");
  const pack_id = str("pack_id");
  if (!pack_entry_id || !pack_id) return null;
  const method = str("link_method") as PackLinkMethod;
  return {
    pack_id,
    pack_name: str("pack_name"),
    pack_entry_id,
    pack_version: str("pack_version"),
    linked_at: str("linked_at"),
    link_method: LINK_METHODS.includes(method) ? method : "manual",
  };
}

export function isLinked(source: unknown): boolean {
  return readPackLink(source) !== null;
}

/** Adds/replaces ONLY `source.link`; every other provenance key survives. */
export function withPackLink(source: unknown, link: PackLink): SourceBag {
  return { ...asSourceBag(source), link: { ...link } };
}

/** Removes ONLY `source.link`; every other provenance key survives. */
export function withoutPackLink(source: unknown): SourceBag {
  const bag = asSourceBag(source);
  delete bag["link"];
  return bag;
}

/* ------------------------------------------------------------------ */
/* Canonical serialisation + version hash                              */
/* ------------------------------------------------------------------ */

export const PACK_VERSION_ALGORITHM = "v1:sha256";

/**
 * Deterministic JSON: object keys sorted lexicographically at every depth,
 * array order preserved, `undefined` keys omitted, no insignificant
 * whitespace. Identical in the browser and on the server.
 */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * The exact payload that is hashed. It is the DEFINITION of a pack item —
 * never editorial or provenance data (summary, description, notes, pages,
 * source labels, editions, timestamps, owner/campaign ids are all excluded),
 * so fixing a typo in a description never invalidates a link.
 *
 * Shape (keys serialised in this alphabetical order by `canonicalJson`):
 *   attribute      string | null   controlling attribute (skill-like only)
 *   base_points    number          base cost
 *   category       string | null   normalised category
 *   cost_per_level number          cost of each level after the first
 *   difficulty     string | null   difficulty letter (skill-like only)
 *   kind           string          entry kind
 *   max_levels     number | null   level cap
 *   name           string          normalised base name (no specialisation)
 */
export interface PackDefinition {
  attribute: string | null;
  base_points: number;
  category: string | null;
  cost_per_level: number;
  difficulty: string | null;
  kind: string;
  max_levels: number | null;
  name: string;
}

/** Kinds whose controlling attribute / difficulty are part of the definition. */
export const SKILL_LIKE_KINDS = ["skill", "technique", "spell"];

export function isSkillLike(kind: string): boolean {
  return SKILL_LIKE_KINDS.includes(kind);
}

export interface PackItemLike {
  kind: string;
  name: string;
  category?: string | null | undefined;
  base_points?: number | null | undefined;
  cost_per_level?: number | null | undefined;
  max_levels?: number | null | undefined;
  data?: Record<string, unknown> | null | undefined;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** The canonical definition of a pack item. */
export function packDefinition(item: PackItemLike): PackDefinition {
  const data = (item.data ?? {}) as Record<string, unknown>;
  const skillLike = isSkillLike(item.kind);
  return {
    attribute: skillLike ? text(data["attribute"]) : null,
    base_points: Number(item.base_points ?? 0),
    category: text(item.category) ? normalizeText(String(item.category)) : null,
    cost_per_level: Number(item.cost_per_level ?? 0),
    difficulty: skillLike ? text(data["difficulty"]) : null,
    kind: item.kind,
    max_levels:
      item.max_levels === null || item.max_levels === undefined ? null : Number(item.max_levels),
    name: normaliseName(item.name),
  };
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `v1:sha256:<lowercase hex>` over the canonical definition payload. */
export async function hashDefinition(definition: PackDefinition): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(definition));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `${PACK_VERSION_ALGORITHM}:${toHex(digest)}`;
}

/** Current canonical version string of a pack item. */
export async function packVersionOf(item: PackItemLike): Promise<string> {
  return hashDefinition(packDefinition(item));
}

/* ------------------------------------------------------------------ */
/* Specialisation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Specialisation is stored structurally at `data.specialization`. Legacy
 * entries that only encode it in the name ("Sobrevivência (Selva)") keep
 * working: the name is parsed as a fallback.
 */
export function specializationOf(entry: {
  name: string;
  data?: Record<string, unknown> | null | undefined;
}): string {
  const stored = (entry.data ?? {})["specialization"];
  if (typeof stored === "string" && stored.trim()) return stored.trim();
  return rawQualifier(entry.name);
}

/** The bare name with any parenthetical qualifier removed, original casing. */
export function baseNameOf(name: string): string {
  return name.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Definition vs progression                                           */
/* ------------------------------------------------------------------ */

/**
 * Fields that make a linked entry MODIFIED when they diverge from the pack.
 * Everything else on the sheet — invested points on a skill, chosen levels on
 * a leveled advantage, specialisation, notes — is the player's progression and
 * never counts on its own.
 */
export const DEFINITION_FIELDS = [
  "name",
  "kind",
  "category",
  "attribute",
  "difficulty",
  "base_points",
  "cost_per_level",
  "max_levels",
] as const;

export const PROGRESSION_FIELDS = ["points", "levels", "specialization", "notes"] as const;

export interface PackDiffEntry {
  field: string;
  pack: unknown;
  character: unknown;
}

export interface CharacterEntryLike {
  kind: string;
  name: string;
  category?: string | null | undefined;
  points: number;
  levels: number;
  data?: Record<string, unknown> | null | undefined;
  notes?: string | null | undefined;
  source?: unknown;
}

/**
 * Cost a leveled trait should carry for the chosen number of levels.
 *
 * Mirrors the existing import rule in `applyCatalogue` (src/lib/trait-match.ts):
 * base cost covers the first level, each further level adds `cost_per_level`.
 * Not a new formula — the same one the app already applies when importing.
 */
export function expectedLeveledCost(
  basePoints: number,
  costPerLevel: number,
  levels: number,
): number {
  const lv = Math.max(1, Number(levels) || 1);
  return costPerLevel ? basePoints + costPerLevel * (lv - 1) : basePoints;
}

/** Pricing check for leveled traits; null when the pack has no per-level cost. */
export function leveledPricing(
  entry: CharacterEntryLike,
  item: PackItemLike,
): { expected: number; actual: number; consistent: boolean } | null {
  if (isSkillLike(entry.kind) || entry.kind === "equipment") return null;
  const costPerLevel = Number(item.cost_per_level ?? 0);
  if (!costPerLevel) return null;
  const expected = expectedLeveledCost(Number(item.base_points ?? 0), costPerLevel, entry.levels);
  const actual = Number(entry.points ?? 0);
  return { expected, actual, consistent: expected === actual };
}

/**
 * Compares a character entry against the canonical pack definition. Only
 * definition fields are considered; progression never appears here.
 */
export function compareDefinition(entry: CharacterEntryLike, item: PackItemLike): PackDiffEntry[] {
  const out: PackDiffEntry[] = [];
  const entryData = (entry.data ?? {}) as Record<string, unknown>;
  const itemData = (item.data ?? {}) as Record<string, unknown>;

  if (normaliseName(entry.name) !== normaliseName(item.name)) {
    out.push({ field: "name", pack: baseNameOf(item.name), character: baseNameOf(entry.name) });
  }
  if (entry.kind !== item.kind) out.push({ field: "kind", pack: item.kind, character: entry.kind });

  const packCategory = text(item.category);
  const entryCategory = text(entry.category);
  if (normalizeText(packCategory ?? "") !== normalizeText(entryCategory ?? "")) {
    out.push({ field: "category", pack: packCategory, character: entryCategory });
  }

  if (isSkillLike(item.kind)) {
    const packAttr = text(itemData["attribute"]);
    const entryAttr = text(entryData["attribute"]);
    if (packAttr && packAttr !== entryAttr) {
      out.push({ field: "attribute", pack: packAttr, character: entryAttr });
    }
    const packDiff = text(itemData["difficulty"]);
    const entryDiff = text(entryData["difficulty"]);
    if (packDiff && packDiff !== entryDiff) {
      out.push({ field: "difficulty", pack: packDiff, character: entryDiff });
    }
    // Invested points are progression for skill-like entries: never compared.
    return out;
  }

  if (entry.kind === "equipment") return out;

  const maxLevels = item.max_levels === null || item.max_levels === undefined ? null : Number(item.max_levels);
  if (maxLevels !== null && maxLevels > 0 && Number(entry.levels ?? 1) > maxLevels) {
    out.push({ field: "max_levels", pack: maxLevels, character: Number(entry.levels ?? 1) });
  }

  const pricing = leveledPricing(entry, item);
  if (pricing) {
    if (!pricing.consistent) {
      out.push({ field: "points", pack: pricing.expected, character: pricing.actual });
    }
    return out;
  }

  const basePoints = Number(item.base_points ?? 0);
  if (Number(entry.points ?? 0) !== basePoints) {
    out.push({ field: "base_points", pack: basePoints, character: Number(entry.points ?? 0) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Derived state                                                       */
/* ------------------------------------------------------------------ */

export type PackLinkState = "official" | "modified" | "custom" | "stale";

export type StaleReason = "removed" | "inaccessible" | "pack_not_allowed" | "version_changed";

export interface PackLinkStatus {
  state: PackLinkState;
  link: PackLink | null;
  stale_reason?: StaleReason;
  /** Machine-readable message key; the UI translates it. */
  message_key?: string;
  diff?: PackDiffEntry[];
  current_version?: string;
  /** True when the current pack item is visible and allowed right now. */
  can_update?: boolean;
}

/**
 * What the caller could learn about the linked pack item under their own
 * access. Nothing here weakens RLS: the resolution is done with the caller's
 * own client and a missing row simply stays missing.
 */
export interface PackResolution {
  item: PackItemLike | null;
  /** Current canonical version of `item`, when it resolved. */
  currentVersion?: string | undefined;
  /** False when the item exists but its pack is not allowed by the campaign. */
  packAllowed: boolean;
  /**
   * Why the item did not resolve.
   *
   * "removed"      — the pack itself is still visible to the caller, so the
   *                  item is gone rather than hidden.
   * "inaccessible" — the pack is no longer visible to the caller at all.
   */
  missingReason?: "removed" | "inaccessible" | undefined;
}

/**
 * The single derivation used by the sheet, the campaign summary and the
 * assistant. Nothing is persisted: state and diff are always recomputed.
 *
 * Precedence: custom -> unavailable/disallowed -> version changed -> modified
 * -> official.
 */
export function derivePackLinkState(
  entry: CharacterEntryLike,
  resolution: PackResolution | null,
): PackLinkStatus {
  const link = readPackLink(entry.source);
  if (!link) return { state: "custom", link: null };

  if (!resolution || !resolution.item) {
    const reason: StaleReason = resolution?.missingReason === "removed" ? "removed" : "inaccessible";
    return {
      state: "stale",
      link,
      stale_reason: reason,
      message_key: `packLink.stale.${reason}`,
      can_update: false,
    };
  }

  if (!resolution.packAllowed) {
    return {
      state: "stale",
      link,
      stale_reason: "pack_not_allowed",
      message_key: "packLink.stale.pack_not_allowed",
      current_version: resolution.currentVersion ?? "",
      can_update: false,
    };
  }

  const current = resolution.currentVersion ?? "";
  if (current && link.pack_version && current !== link.pack_version) {
    return {
      state: "stale",
      link,
      stale_reason: "version_changed",
      message_key: "packLink.stale.version_changed",
      current_version: current,
      diff: compareDefinition(entry, resolution.item),
      can_update: true,
    };
  }

  const diff = compareDefinition(entry, resolution.item);
  if (diff.length > 0) {
    return { state: "modified", link, diff, current_version: current, can_update: true };
  }
  return { state: "official", link, current_version: current, can_update: true };
}

/** Counts per state, used by the sheet header and the Game Master summary. */
export interface PackLinkCounts {
  official: number;
  modified: number;
  custom: number;
  stale: number;
}

export function emptyCounts(): PackLinkCounts {
  return { official: 0, modified: 0, custom: 0, stale: 0 };
}

export function countStates(statuses: { state: PackLinkState }[]): PackLinkCounts {
  const counts = emptyCounts();
  for (const status of statuses) counts[status.state] += 1;
  return counts;
}

/* ------------------------------------------------------------------ */
/* Restoring definition fields                                         */
/* ------------------------------------------------------------------ */

export interface RestorePatch {
  name: string;
  category: string | null;
  points: number;
  levels: number;
  data: Record<string, unknown>;
}

/**
 * Definition fields taken from the current pack item, progression kept:
 * invested skill points, chosen levels, specialisation and notes are never
 * overwritten. Used by both "Restaurar do pack" and "Atualizar para a versão
 * atual" so the two can never drift apart.
 */
export function restoreDefinitionPatch(
  entry: CharacterEntryLike,
  item: PackItemLike,
): RestorePatch {
  const entryData = { ...((entry.data ?? {}) as Record<string, unknown>) };
  const itemData = { ...((item.data ?? {}) as Record<string, unknown>) };
  const specialization = specializationOf(entry);

  // Pack definition data first, then the player's own choices back on top.
  const data: Record<string, unknown> = { ...itemData, ...entryData };
  if (isSkillLike(entry.kind)) {
    if (text(itemData["attribute"])) data["attribute"] = itemData["attribute"];
    if (text(itemData["difficulty"])) data["difficulty"] = itemData["difficulty"];
    // Invested points stay exactly as the player bought them.
    data["points"] = Number(entryData["points"] ?? entry.points ?? 0);
  }
  if (specialization) data["specialization"] = specialization;

  const maxLevels =
    item.max_levels === null || item.max_levels === undefined ? null : Number(item.max_levels);
  let levels = Math.max(1, Number(entry.levels ?? 1) || 1);
  if (maxLevels !== null && maxLevels > 0 && levels > maxLevels) levels = maxLevels;

  const basePoints = Number(item.base_points ?? 0);
  const costPerLevel = Number(item.cost_per_level ?? 0);
  const points = isSkillLike(entry.kind)
    ? Number(entry.points ?? 0)
    : entry.kind === "equipment"
      ? Number(entry.points ?? 0)
      : expectedLeveledCost(basePoints, costPerLevel, levels);

  const name = specialization && !rawQualifier(item.name)
    ? `${baseNameOf(item.name)} (${specialization})`
    : item.name;

  return {
    name,
    category: text(item.category),
    points,
    levels,
    data,
  };
}
