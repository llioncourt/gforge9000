/**
 * Shared pack-link operations used by BOTH the character sheet UI and the
 * assistant (MCP), so the two can never drift apart.
 *
 * Every read and write here runs through the caller's own RLS-scoped Supabase
 * client. Nothing bypasses access rules and nothing rewrites provenance: a
 * link only ever adds or removes `source.link`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { allowedPacksOf, isPackAllowed } from "@/lib/packs";
import {
  derivePackLinkState,
  packVersionOf,
  readPackLink,
  restoreDefinitionPatch,
  type RestoreWarning,
  specializationOf,
  withPackLink,
  withoutPackLink,
  type CharacterEntryLike,
  type PackLink,
  type PackLinkMethod,
  type PackLinkStatus,
  type PackResolution,
} from "@/lib/pack-link";
import { loadPackIndex, toCandidate, type PackCandidate, type PackClient } from "@/lib/pack-match";

export type { PackClient } from "@/lib/pack-match";

export interface EntryRowLike extends CharacterEntryLike {
  id: string;
  character_id?: string | undefined;
}

const ENTRY_COLUMNS =
  "id,character_id,kind,name,category,points,levels,data,notes,source,sort_order";

const CANDIDATE_COLUMNS =
  "id,owner_id,kind,name,category,base_points,cost_per_level,max_levels,pack,data";

/* ------------------------------------------------------------------ */
/* Resolving linked items                                              */
/* ------------------------------------------------------------------ */

export interface ResolvedPackItems {
  byId: Map<string, PackCandidate>;
  /** Pack ids the caller can still see. */
  visiblePackIds: Set<string>;
  /**
   * Pack ids the caller OWNS. Only for these can an absent item be proved to
   * have been removed — see `resolutionFor`.
   */
  ownedPackIds: Set<string>;
}

/**
 * Loads the pack items referenced by a set of links, under the caller's own
 * access.
 *
 * RLS note: with the caller's client an item that was deleted and an item that
 * merely became invisible both come back as "no row", so the two can normally
 * NOT be told apart. The one case where they can is when the caller owns the
 * linked pack: `library_entries` is readable by its owner
 * (`owner_id = auth.uid()`) and a pack is owner-scoped, so the owner sees every
 * entry in their own pack. If the linked id is absent there, it really is gone.
 *
 * In every other case the result stays the conservative "inaccessible" — we do
 * not guess. No policy is weakened and no service-role client is used.
 */
export async function resolveLinkedItems(
  client: PackClient,
  links: PackLink[],
  callerUserId?: string | null | undefined,
): Promise<ResolvedPackItems> {
  const byId = new Map<string, PackCandidate>();
  const visiblePackIds = new Set<string>();
  const ownedPackIds = new Set<string>();
  if (links.length === 0) return { byId, visiblePackIds, ownedPackIds };

  const entryIds = [...new Set(links.map((l) => l.pack_entry_id))];
  const packIds = [...new Set(links.map((l) => l.pack_id).filter(Boolean))];

  const packIndex = await loadPackIndex(client);
  for (const value of packIndex.values()) visiblePackIds.add(value.id);

  if (packIds.length) {
    const { data, error } = await client
      .from("content_packs")
      .select("id,owner_id")
      .in("id", packIds);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      visiblePackIds.add(row.id);
      if (callerUserId && row.owner_id === callerUserId) ownedPackIds.add(row.id);
    }
  }

  for (let i = 0; i < entryIds.length; i += 200) {
    const batch = entryIds.slice(i, i + 200);
    const { data, error } = await client
      .from("library_entries")
      .select(CANDIDATE_COLUMNS)
      .in("id", batch);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as Parameters<typeof toCandidate>[0][]) {
      const candidate = toCandidate(row, packIndex);
      byId.set(candidate.id, candidate);
    }
  }
  return { byId, visiblePackIds, ownedPackIds };
}

export async function resolutionFor(
  link: PackLink,
  resolved: ResolvedPackItems,
  campaignSettings: unknown,
): Promise<PackResolution> {
  const item = resolved.byId.get(link.pack_entry_id) ?? null;
  if (!item) {
    // "removed" is only claimed when it is provable: the caller owns the pack,
    // so they would see the item if it still existed. Otherwise: inaccessible.
    return {
      item: null,
      packAllowed: true,
      missingReason: resolved.ownedPackIds.has(link.pack_id) ? "removed" : "inaccessible",
    };
  }
  const allowed = allowedPacksOf(campaignSettings);
  return {
    item,
    currentVersion: await packVersionOf(item),
    packAllowed: campaignSettings === undefined ? true : isPackAllowed(item.pack, allowed),
  };
}

/** Derived state for many entries at once; nothing is stored. */
export async function deriveStatuses(
  client: PackClient,
  entries: EntryRowLike[],
  campaignSettings: unknown,
  callerUserId?: string | null | undefined,
): Promise<Map<string, PackLinkStatus>> {
  const links = entries
    .map((entry) => readPackLink(entry.source))
    .filter((link): link is PackLink => link !== null);
  const resolved = await resolveLinkedItems(client, links, callerUserId);
  const out = new Map<string, PackLinkStatus>();
  for (const entry of entries) {
    const link = readPackLink(entry.source);
    const resolution = link ? await resolutionFor(link, resolved, campaignSettings) : null;
    out.set(entry.id, derivePackLinkState(entry, resolution));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Loading rows                                                        */
/* ------------------------------------------------------------------ */

export async function loadEntryRow(client: PackClient, entryId: string): Promise<EntryRowLike> {
  const { data, error } = await client
    .from("character_entries")
    .select(ENTRY_COLUMNS)
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Entry not found, or you do not have access to it.");
  return data as unknown as EntryRowLike;
}

export async function loadCampaignSettings(
  client: PackClient,
  campaignId: string | null,
): Promise<unknown> {
  if (!campaignId) return undefined;
  const { data, error } = await client
    .from("campaigns")
    .select("settings")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.settings;
}

/** One pack item by id, with its pack identity resolved. */
export async function loadPackItem(
  client: PackClient,
  packEntryId: string,
): Promise<PackCandidate | null> {
  const packIndex = await loadPackIndex(client);
  const { data, error } = await client
    .from("library_entries")
    .select(CANDIDATE_COLUMNS)
    .eq("id", packEntryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return toCandidate(data as unknown as Parameters<typeof toCandidate>[0], packIndex);
}

/**
 * Checks a direct link target: it must be visible to the caller and, when the
 * character belongs to a campaign, its pack must be allowed there.
 */
export async function requireLinkableItem(
  client: PackClient,
  packEntryId: string,
  campaignSettings: unknown,
): Promise<PackCandidate> {
  const item = await loadPackItem(client, packEntryId);
  if (!item) throw new Error("Pack item not found, or you do not have access to it.");
  if (campaignSettings !== undefined) {
    const allowed = allowedPacksOf(campaignSettings);
    if (!isPackAllowed(item.pack, allowed)) {
      throw new Error(`The "${item.pack ?? ""}" pack is not enabled for this campaign.`);
    }
  }
  return item;
}

/* ------------------------------------------------------------------ */
/* Building the link                                                   */
/* ------------------------------------------------------------------ */

export async function buildLink(
  item: PackCandidate,
  method: PackLinkMethod,
  now: Date = new Date(),
): Promise<PackLink> {
  if (!item.pack_id) {
    throw new Error(
      `"${item.name}" is not inside a content pack you can see, so it cannot be linked.`,
    );
  }
  return {
    pack_id: item.pack_id,
    pack_name: item.pack_name ?? item.pack ?? "",
    pack_entry_id: item.id,
    pack_version: item.pack_version ?? (await packVersionOf(item)),
    linked_at: now.toISOString(),
    link_method: method,
  };
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

export interface LinkOutcome {
  entry: EntryRowLike;
  status: PackLinkStatus;
  /** Things the player should be told about; never applied silently. */
  warnings?: RestoreWarning[];
}

async function statusOf(
  client: PackClient,
  entry: EntryRowLike,
  campaignSettings: unknown,
  callerUserId?: string | null | undefined,
): Promise<PackLinkStatus> {
  const statuses = await deriveStatuses(client, [entry], campaignSettings, callerUserId);
  return statuses.get(entry.id) ?? { state: "custom", link: null };
}

async function updateEntryRow(
  client: PackClient,
  entryId: string,
  patch: Record<string, unknown>,
): Promise<EntryRowLike> {
  const { data, error } = await client
    .from("character_entries")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validated partial column subset
    .update(patch as any)
    .eq("id", entryId)
    .select(ENTRY_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as EntryRowLike;
}

/**
 * Adds `source.link` to an existing entry. Sheet values are deliberately left
 * untouched — linking states a fact, it does not rewrite the character.
 * Specialisation typed into the name is stored structurally when it is missing.
 */
export async function linkEntry(
  client: PackClient,
  entry: EntryRowLike,
  item: PackCandidate,
  method: PackLinkMethod,
  campaignSettings: unknown,
): Promise<LinkOutcome> {
  const link = await buildLink(item, method);
  const patch: Record<string, unknown> = { source: withPackLink(entry.source, link) };
  const specialization = specializationOf(entry);
  const data = { ...((entry.data ?? {}) as Record<string, unknown>) };
  if (specialization && !data["specialization"]) {
    data["specialization"] = specialization;
    patch["data"] = data;
  }
  const updated = await updateEntryRow(client, entry.id, patch);
  return { entry: updated, status: await statusOf(client, updated, campaignSettings) };
}

/** Removes ONLY `source.link`; every sheet value and provenance key survives. */
export async function unlinkEntry(
  client: PackClient,
  entry: EntryRowLike,
  campaignSettings: unknown,
): Promise<LinkOutcome> {
  const updated = await updateEntryRow(client, entry.id, {
    source: withoutPackLink(entry.source),
  });
  return { entry: updated, status: await statusOf(client, updated, campaignSettings) };
}

/**
 * "Restaurar do pack" / "Atualizar para a versão atual" — one explicit action
 * with one implementation: definition fields come from the current pack item,
 * progression is preserved, and the stored version is refreshed.
 */
export async function restoreFromPack(
  client: PackClient,
  entry: EntryRowLike,
  campaignSettings: unknown,
): Promise<LinkOutcome> {
  const link = readPackLink(entry.source);
  if (!link) throw new Error("This entry is not linked to a content pack.");
  const item = await requireLinkableItem(client, link.pack_entry_id, campaignSettings);
  const patch = restoreDefinitionPatch(entry, item);
  const refreshed: PackLink = {
    ...link,
    pack_id: item.pack_id ?? link.pack_id,
    pack_name: item.pack_name ?? link.pack_name,
    pack_version: await packVersionOf(item),
  };
  const updated = await updateEntryRow(client, entry.id, {
    name: patch.name,
    category: patch.category,
    points: patch.points,
    levels: patch.levels,
    data: patch.data,
    source: withPackLink(entry.source, refreshed),
  });
  return {
    entry: updated,
    status: await statusOf(client, updated, campaignSettings),
    warnings: patch.warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Campaign-wide summary                                               */
/* ------------------------------------------------------------------ */

export interface CharacterPackSummary {
  character_id: string;
  name: string;
  official: number;
  modified: number;
  custom: number;
  stale: number;
}

/** Per-character counts for the Game Master overview; same derivation code. */
export async function summarizeCampaign(
  client: SupabaseClient<Database>,
  campaignId: string,
  callerUserId?: string | null | undefined,
): Promise<CharacterPackSummary[]> {
  const { data: characters, error } = await client
    .from("characters")
    .select("id,name")
    .eq("campaign_id", campaignId)
    .order("name");
  if (error) throw new Error(error.message);
  const ids = (characters ?? []).map((row) => row.id);
  if (ids.length === 0) return [];

  const { data: entries, error: entriesError } = await client
    .from("character_entries")
    .select(ENTRY_COLUMNS)
    .in("character_id", ids);
  if (entriesError) throw new Error(entriesError.message);

  const settings = await loadCampaignSettings(client, campaignId);
  const rows = (entries ?? []) as unknown as EntryRowLike[];
  const statuses = await deriveStatuses(client, rows, settings, callerUserId);


  return (characters ?? []).map((character) => {
    const summary: CharacterPackSummary = {
      character_id: character.id,
      name: character.name,
      official: 0,
      modified: 0,
      custom: 0,
      stale: 0,
    };
    for (const row of rows) {
      if (row.character_id !== character.id) continue;
      const status = statuses.get(row.id);
      if (status) summary[status.state] += 1;
    }
    return summary;
  });
}
