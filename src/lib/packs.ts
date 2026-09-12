/**
 * Campaign content-pack gating (pure helpers).
 *
 * Rule: a campaign may list allowed content packs in its settings.
 * - Empty list  -> every pack is allowed.
 * - Non-empty   -> only the listed packs are allowed.
 * - Entries with no pack are personal/user content and are always allowed;
 *   pack gating only restricts named content packs.
 */

export function allowedPacksOf(settings: unknown): string[] {
  if (!settings || typeof settings !== "object") return [];
  const raw = (settings as Record<string, unknown>)["allowed_packs"];
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => String(p).trim()).filter(Boolean);
}

export function isPackAllowed(pack: string | null | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const name = (pack ?? "").trim();
  if (!name) return true;
  return allowed.some((a) => a.toLowerCase() === name.toLowerCase());
}

export function packGateReason(
  pack: string | null | undefined,
  allowed: string[],
): string | null {
  if (isPackAllowed(pack, allowed)) return null;
  return `Pack “${(pack ?? "").trim()}” is not enabled for this campaign.`;
}

/* ---------- pack grouping ---------- */

export const UNPACKED_LABEL = "Unpacked / Personal Content";

export interface PackEntryLike {
  id?: string;
  kind: string;
  name: string;
  pack: string | null;
  source_label?: string | null;
  source_edition?: string | null;
  source_type?: string | null;
  visibility?: string | null;
  owner_id?: string | null;
}

export interface PackGroup<T extends PackEntryLike = PackEntryLike> {
  /** null for personal content that belongs to no pack. */
  pack: string | null;
  label: string;
  entries: T[];
  total: number;
  kinds: { kind: string; count: number }[];
  sources: string[];
  visibilities: string[];
}

/** Groups library entries by their pack name; personal content is kept visible. */
export function groupEntriesByPack<T extends PackEntryLike>(entries: T[]): PackGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const entry of entries) {
    const key = (entry.pack ?? "").trim() || "";
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }
  const groups: PackGroup<T>[] = [];
  for (const [key, list] of buckets) {
    groups.push(makeGroup(key === "" ? null : key, list));
  }
  groups.sort((a, b) => {
    if (a.pack === null) return 1;
    if (b.pack === null) return -1;
    return a.label.localeCompare(b.label);
  });
  return groups;
}

export function makeGroup<T extends PackEntryLike>(pack: string | null, entries: T[]): PackGroup<T> {
  const counts = new Map<string, number>();
  const sources = new Set<string>();
  const visibilities = new Set<string>();
  for (const e of entries) {
    counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    if (e.source_label) sources.add(e.source_label);
    if (e.visibility) visibilities.add(e.visibility);
  }
  return {
    pack,
    label: pack ?? UNPACKED_LABEL,
    entries,
    total: entries.length,
    kinds: [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
    sources: [...sources].sort(),
    visibilities: [...visibilities].sort(),
  };
}

/** Groups a pack's entries by kind for the detail view. */
export function groupEntriesByKind<T extends PackEntryLike>(
  entries: T[],
): { kind: string; entries: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const e of entries) {
    const list = buckets.get(e.kind);
    if (list) list.push(e);
    else buckets.set(e.kind, [e]);
  }
  return [...buckets.entries()]
    .map(([kind, list]) => ({
      kind,
      entries: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/** Campaigns (that the user GMs) where a given pack is enabled. */
export function campaignsEnablingPack(
  pack: string | null,
  campaigns: { id: string; name: string; settings: unknown }[],
): { id: string; name: string }[] {
  if (!pack) return [];
  return campaigns
    .filter((c) => allowedPacksOf(c.settings).some((a) => a.toLowerCase() === pack.toLowerCase()))
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Immutable toggle of a pack inside a campaign's allowed-pack list. */
export function togglePackInList(allowed: string[], pack: string, enabled: boolean): string[] {
  const without = allowed.filter((a) => a.toLowerCase() !== pack.toLowerCase());
  return enabled ? [...without, pack] : without;
}


/**
 * Placeholder kept in a campaign allow list when a GM disables the only pack.
 * An empty list means "all packs allowed", so the list must stay non-empty to
 * express "no packs allowed". It matches no real pack name.
 */
export const NO_PACKS_MARKER = "(no packs)";
