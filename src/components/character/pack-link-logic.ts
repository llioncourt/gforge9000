/**
 * Logic behind the sheet-side content-pack link: derived statuses, cache
 * invalidation and the bulk-link selection rules. The components that render
 * it live in `pack-link.tsx`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import type { CharacterEntry } from "@/rules";
import type { PackLinkStatus } from "@/lib/pack-link";
import type { PackCandidate } from "@/lib/pack-match";
import { deriveStatuses, type EntryRowLike } from "@/lib/pack-link-service";

export function asRow(entry: CharacterEntry): EntryRowLike {
  return entry as unknown as EntryRowLike;
}

/**
 * A stable snapshot of every field that can change an entry's derived pack
 * state (PL-011): kind, name, category, points, levels, the pack-relevant
 * `data` keys and the provenance/link itself. Anything else on the entry
 * (notes, ids, sort order) is deliberately excluded so the cache does not
 * churn on unrelated edits.
 */
export function entryStatusFingerprint(entry: CharacterEntry): string {
  const data = (entry.data ?? {}) as Record<string, unknown>;
  return JSON.stringify({
    kind: entry.kind,
    name: entry.name,
    category: entry.category ?? null,
    points: entry.points,
    levels: entry.levels,
    data: {
      attribute: data["attribute"] ?? null,
      difficulty: data["difficulty"] ?? null,
      defaults: data["defaults"] ?? null,
      defaultPenalty: data["defaultPenalty"] ?? null,
      baseSkill: data["baseSkill"] ?? null,
      prerequisites: data["prerequisites"] ?? null,
      specialization_required: data["specialization_required"] ?? null,
    },
    source: entry.source ?? null,
  });
}

/** Invalidates every query that can go stale after an entry mutation (PL-011). */
export function invalidatePackLinkQueries(
  queryClient: { invalidateQueries: (opts: { queryKey: unknown[] }) => unknown },
  characterId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["entries", characterId] });
  void queryClient.invalidateQueries({ queryKey: ["pack-link-status"] });
  void queryClient.invalidateQueries({ queryKey: ["pack-link-summary"] });
}

/**
 * Derived state for every entry on the sheet; nothing is stored.
 *
 * The signed-in user's id is passed to the shared derivation so a link whose
 * pack the user owns can honestly report "removed"; for someone else's pack
 * the derivation stays conservative and reports "inaccessible".
 */
export function usePackLinkStatuses(
  entries: CharacterEntry[],
  campaignSettings: unknown,
  callerUserId?: string | null,
) {
  const { user } = useSession();
  const userId = callerUserId ?? user?.id ?? null;
  const key = entries.map((entry) => `${entry.id}:${entryStatusFingerprint(entry)}`).join("|");
  return useQuery({
    queryKey: ["pack-link-status", key, JSON.stringify(campaignSettings ?? null), userId],
    queryFn: () => deriveStatuses(supabase, entries.map(asRow), campaignSettings, userId),
    enabled: entries.length > 0,
    staleTime: 30_000,
  });
}

/** Whether the "restore"/"update" action should be offered (PL-007). */
export function shouldShowRestoreAction(status: PackLinkStatus | undefined): boolean {
  if (!status) return false;
  if (status.state !== "modified" && status.state !== "stale") return false;
  return status.can_update === true;
}

export interface Proposal {
  entry: CharacterEntry;
  item: PackCandidate | null;
  candidates: PackCandidate[];
  status: "unique" | "ambiguous" | "none";
}

/** One row's resolution state in the bulk dialog (PL-009). */
export interface BulkRowChoice {
  /** Whether this row is included when the user confirms. */
  selected: boolean;
  /** The pack item the row will link to, once resolved. */
  item: PackCandidate | null;
}

export type BulkSelection = Record<string, BulkRowChoice>;

/** Starting selection: unique matches default selected, everything else waits for a choice. */
export function initBulkSelection(proposals: Proposal[]): BulkSelection {
  const out: BulkSelection = {};
  for (const row of proposals) {
    out[row.entry.id] =
      row.status === "unique" && row.item
        ? { selected: true, item: row.item }
        : { selected: false, item: null };
  }
  return out;
}

/** Toggles whether an already-resolved row is included. */
export function toggleBulkRow(selection: BulkSelection, entryId: string): BulkSelection {
  const current = selection[entryId];
  if (!current) return selection;
  return { ...selection, [entryId]: { ...current, selected: !current.selected } };
}

/** Records the user's explicit choice among an ambiguous row's candidates. */
export function chooseBulkCandidate(
  selection: BulkSelection,
  entryId: string,
  item: PackCandidate | null,
): BulkSelection {
  return { ...selection, [entryId]: { selected: item !== null, item } };
}

/** Only rows the user explicitly selected AND resolved are ever applied. */
export function selectedBulkLinks(
  selection: BulkSelection,
  proposals: Proposal[],
): { entry: CharacterEntry; item: PackCandidate }[] {
  const out: { entry: CharacterEntry; item: PackCandidate }[] = [];
  for (const row of proposals) {
    const choice = selection[row.entry.id];
    if (choice?.selected && choice.item) out.push({ entry: row.entry, item: choice.item });
  }
  return out;
}
