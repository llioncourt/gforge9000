import type { EntityRow, GrantRow } from "@/lib/lore";
import { isPlayerVisible } from "@/lib/visibility";

/**
 * What the GM has let one player in on, gathered for display on that
 * player's character sheet.
 *
 * Two sources count as "revealed":
 * - records the GM revealed to this player specifically (a knowledge grant);
 * - records the GM made visible to every player in the campaign.
 *
 * A record that is both is listed once, under the player's own reveals.
 * Archived records are left out. Records the caller cannot read are simply
 * absent from `entities`, so a grant pointing at one is skipped.
 */
export type RevealItem = {
  entity: EntityRow;
  source: "player" | "everyone";
  /** When the GM revealed it to this player; unknown for campaign-wide records. */
  revealedAt: string | null;
  /** Optional note the GM attached to the reveal. */
  note: string | null;
};

export type RevealList = {
  forPlayer: RevealItem[];
  forEveryone: RevealItem[];
};

export function buildRevealList(
  entities: readonly EntityRow[],
  grants: readonly GrantRow[],
  playerId: string | null | undefined,
): RevealList {
  const live = entities.filter((entity) => !entity.archived_at);
  const byId = new Map(live.map((entity) => [entity.id, entity]));

  // Newest reveal first; one line per record even if it was revealed twice.
  const latestGrant = new Map<string, GrantRow>();
  for (const grant of grants) {
    if (!playerId || grant.user_id !== playerId) continue;
    const current = latestGrant.get(grant.entity_id);
    if (!current || grant.created_at > current.created_at) latestGrant.set(grant.entity_id, grant);
  }

  const forPlayer: RevealItem[] = [];
  for (const grant of latestGrant.values()) {
    const entity = byId.get(grant.entity_id);
    if (!entity) continue;
    forPlayer.push({
      entity,
      source: "player",
      revealedAt: grant.created_at,
      note: grant.note?.trim() ? grant.note : null,
    });
  }
  forPlayer.sort((a, b) => (b.revealedAt ?? "").localeCompare(a.revealedAt ?? ""));

  const forEveryone: RevealItem[] = live
    .filter((entity) => isPlayerVisible(entity.visibility) && !latestGrant.has(entity.id))
    .map((entity) => ({ entity, source: "everyone" as const, revealedAt: null, note: null }))
    .sort((a, b) => a.entity.name.localeCompare(b.entity.name));

  return { forPlayer, forEveryone };
}

/** Case-insensitive match on the texts a player can read on a record. */
export function matchesRevealSearch(item: RevealItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const { entity } = item;
  return [entity.name, entity.summary, entity.player_description, ...(entity.aliases ?? [])]
    .filter((text): text is string => typeof text === "string")
    .some((text) => text.toLowerCase().includes(needle));
}
