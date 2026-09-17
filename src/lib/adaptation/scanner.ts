/**
 * Campaign scanner.
 *
 * Builds a complete, hashable snapshot of the selected part of a campaign.
 * Only metadata is read here — binaries are fetched later, when a bundle is
 * actually exported — so scanning stays fast on large campaigns.
 *
 * `buildScanSnapshot` is pure and fully unit testable; `scanCampaign` is the
 * thin IO wrapper that feeds it.
 */

import { getCampaign, listCampaignCharacters, listEntriesForCharacters, listNotes } from "@/lib/api";
import { listAssets } from "@/lib/assets";
import { listMapObjects, listMaps } from "@/lib/battlemap";
import { listCampaignVideos } from "@/lib/campaign-intro";
import { listCampaignSoundFx } from "@/lib/campaign-sound-fx";
import { listCampaignSoundtracks } from "@/lib/campaign-soundtrack";
import { listCampaignGrants, listEntities, listRelationships } from "@/lib/lore";
import { hashValue, stableKey } from "@/lib/adaptation/hash";
import type { ScannedSource } from "@/lib/adaptation/diff";
import type { SourceMode } from "@/lib/adaptation/types";
import { listSessionChronicles, listSessionChronicleItems } from "@/lib/adaptation/chronicle-api";

export interface ScanScope {
  /** Empty means "the whole campaign". */
  entity_ids?: string[];
  /** Restrict to a story branch: every descendant of these outline entries. */
  root_entity_ids?: string[];
  session_chronicle_ids?: string[];
  session_range?: { from?: number | null; to?: number | null };
  include_assets?: boolean;
  include_maps?: boolean;
  include_media?: boolean;
  include_characters?: boolean;
}

export interface ScanRecord {
  source_type: string;
  source_id: string | null;
  label: string;
  /** The payload that defines this record's identity for hashing. */
  payload: Record<string, unknown>;
  gm_only: boolean;
}

export interface ScanSnapshot {
  campaign_id: string;
  campaign_name: string;
  snapshot_hash: string;
  sources: ScannedSource[];
  records: Record<string, ScanRecord>;
  stats: Record<string, number>;
}

/** Pure: turns a flat list of records into a hashed, keyed snapshot. */
export function buildScanSnapshot(
  campaignId: string,
  campaignName: string,
  records: ScanRecord[],
): ScanSnapshot {
  const sources: ScannedSource[] = [];
  const byKey: Record<string, ScanRecord> = {};
  const stats: Record<string, number> = {};

  for (const record of records) {
    const key = stableKey(record.source_type, record.source_id ?? record.label);
    if (byKey[key]) continue;
    byKey[key] = record;
    sources.push({
      source_key: key,
      source_type: record.source_type,
      source_id: record.source_id,
      source_hash: hashValue(record.payload),
      label: record.label,
    });
    stats[record.source_type] = (stats[record.source_type] ?? 0) + 1;
  }

  sources.sort((a, b) => a.source_key.localeCompare(b.source_key));

  return {
    campaign_id: campaignId,
    campaign_name: campaignName,
    snapshot_hash: hashValue(sources.map((s) => [s.source_key, s.source_hash])),
    sources,
    records: byKey,
    stats,
  };
}

/** Expands a story-branch selection into every descendant entry. */
export function expandBranch(
  entities: { id: string; parent_id?: string | null }[],
  rootIds: string[],
): string[] {
  const children = new Map<string, string[]>();
  for (const entity of entities) {
    const parent = entity.parent_id ?? null;
    if (!parent) continue;
    children.set(parent, [...(children.get(parent) ?? []), entity.id]);
  }
  const out = new Set<string>();
  const queue = [...rootIds];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return [...out];
}

function inSessionRange(sessionNo: number | null, scope: ScanScope): boolean {
  const range = scope.session_range;
  if (!range) return true;
  if (sessionNo == null) return !range.from && !range.to;
  if (range.from != null && sessionNo < range.from) return false;
  if (range.to != null && sessionNo > range.to) return false;
  return true;
}

/** Reads the campaign and produces a snapshot for the given scope. */
export async function scanCampaign(
  campaignId: string,
  scope: ScanScope,
  sourceMode: SourceMode,
  onProgress?: (label: string, done: number, total: number) => void,
): Promise<ScanSnapshot> {
  const steps = 8;
  let done = 0;
  const tick = (label: string) => onProgress?.(label, ++done, steps);

  const campaign = await getCampaign(campaignId);
  tick("campaign");

  const records: ScanRecord[] = [
    {
      source_type: "campaign",
      source_id: campaign.id,
      label: campaign.name,
      gm_only: false,
      payload: {
        name: campaign.name,
        description: campaign.description,
        settings: campaign.settings,
      },
    },
  ];

  const [entities, relationships, grants] = await Promise.all([
    listEntities(campaignId),
    listRelationships(campaignId),
    listCampaignGrants(campaignId).catch(() => []),
  ]);
  tick("lore");

  const explicit = new Set(scope.entity_ids ?? []);
  const branch = new Set(
    scope.root_entity_ids?.length
      ? expandBranch(
          entities.map((entity) => ({
            id: entity.id,
            parent_id: (entity as { parent_id?: string | null }).parent_id ?? null,
          })),
          scope.root_entity_ids,
        )
      : [],
  );
  const selected = entities.filter(
    (entity) =>
      (explicit.size === 0 && branch.size === 0) || explicit.has(entity.id) || branch.has(entity.id),
  );
  const selectedIds = new Set(selected.map((entity) => entity.id));

  const grantsByEntity = new Map<string, string[]>();
  for (const grant of grants) {
    const list = grantsByEntity.get(grant.entity_id) ?? [];
    list.push(grant.user_id);
    grantsByEntity.set(grant.entity_id, list);
  }

  for (const entity of selected) {
    records.push({
      source_type: "entity",
      source_id: entity.id,
      label: entity.name,
      gm_only: entity.visibility === "GM_ONLY" || entity.visibility === "UNREVEALED",
      payload: {
        kind: entity.kind,
        name: entity.name,
        status: entity.status,
        visibility: entity.visibility,
        summary: entity.summary,
        description: entity.description,
        player_description: entity.player_description,
        gm_notes: entity.gm_notes,
        aliases: entity.aliases,
        tags: entity.tags,
        data: entity.data,
        canon_locked: (entity as { canon_locked?: boolean }).canon_locked ?? false,
        grants: (grantsByEntity.get(entity.id) ?? []).slice().sort(),
      },
    });
  }

  for (const rel of relationships) {
    if (!selectedIds.has(rel.source_id) && !selectedIds.has(rel.target_id)) continue;
    records.push({
      source_type: "relationship",
      source_id: rel.id,
      label: rel.rel_type,
      gm_only: rel.visibility === "GM_ONLY" || rel.visibility === "UNREVEALED",
      payload: {
        source_id: rel.source_id,
        target_id: rel.target_id,
        rel_type: rel.rel_type,
        description: rel.description,
        gm_description: rel.gm_description,
        visibility: rel.visibility,
        is_current: rel.is_current,
      },
    });
  }
  tick("entities");

  if (scope.include_characters !== false) {
    const characters = await listCampaignCharacters(campaignId);
    const entries = characters.length
      ? await listEntriesForCharacters(characters.map((character) => character.id))
      : [];
    for (const character of characters) {
      records.push({
        source_type: "character",
        source_id: character.id,
        label: character.name,
        gm_only: false,
        payload: {
          name: character.name,
          concept: character.concept,
          notes: character.notes,
          portrait_path: character.portrait_path,
          model_path: (character as { model_path?: string | null }).model_path ?? null,
          appearance: character.appearance,
          attributes: {
            st: character.st,
            dx: character.dx,
            iq: character.iq,
            ht: character.ht,
          },
          entries: entries
            .filter((entry) => entry.character_id === character.id)
            .map((entry) => ({ kind: entry.kind, name: entry.name, data: entry.data }))
            .sort((a, b) => `${a.kind}${a.name}`.localeCompare(`${b.kind}${b.name}`)),
        },
      });
    }
  }
  tick("characters");

  const notes = await listNotes(campaignId);
  const wantsPlanned = sourceMode !== "played";
  const wantsPlayed = sourceMode !== "planned";
  for (const note of notes) {
    const isPrep = note.kind === "session-prep";
    const isRecap = note.kind === "session";
    if (isPrep && !wantsPlanned) continue;
    if (isRecap && !wantsPlayed) continue;
    records.push({
      source_type: `note:${note.kind}`,
      source_id: note.id,
      label: note.title,
      gm_only: note.gm_only,
      payload: { kind: note.kind, title: note.title, body: note.body, gm_only: note.gm_only },
    });
  }
  tick("notes");

  if (wantsPlayed) {
    const chronicles = await listSessionChronicles(campaignId).catch(() => []);
    const wanted = new Set(scope.session_chronicle_ids ?? []);
    for (const chronicle of chronicles) {
      if (wanted.size && !wanted.has(chronicle.id)) continue;
      if (!inSessionRange(chronicle.session_no, scope)) continue;
      const items = await listSessionChronicleItems(chronicle.id).catch(() => []);
      records.push({
        source_type: "session_chronicle",
        source_id: chronicle.id,
        label: chronicle.title,
        gm_only: true,
        payload: {
          title: chronicle.title,
          session_no: chronicle.session_no,
          played_on: chronicle.played_on,
          transcript: chronicle.transcript,
          raw_notes: chronicle.raw_notes,
          approved_recap: chronicle.approved_recap,
          items: items
            .map((item) => ({
              item_type: item.item_type,
              summary: item.summary,
              detail: item.detail,
              review_status: item.review_status,
              provenance_type: item.provenance_type,
            }))
            .sort((a, b) => a.summary.localeCompare(b.summary)),
        },
      });
    }
  }
  tick("sessions");

  if (scope.include_assets !== false) {
    for (const asset of await listAssets(campaignId)) {
      records.push({
        source_type: "asset",
        source_id: asset.id,
        label: asset.title,
        gm_only: !asset.visible_to_players,
        payload: {
          title: asset.title,
          caption: asset.caption,
          tags: asset.tags,
          storage_path: asset.storage_path,
          visible_to_players: asset.visible_to_players,
        },
      });
    }
  }
  if (scope.include_maps !== false) {
    for (const map of await listMaps(campaignId)) {
      const objects = await listMapObjects(map.id).catch(() => []);
      records.push({
        source_type: "map",
        source_id: map.id,
        label: map.name,
        gm_only: !map.visible_to_players,
        payload: {
          name: map.name,
          image_path: map.image_path,
          grid_type: map.grid_type,
          objects: objects
            .map((object) => ({ label: object.label, kind: object.kind, hidden: object.hidden }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        },
      });
    }
  }
  tick("assets");

  if (scope.include_media !== false) {
    for (const video of await listCampaignVideos(campaignId)) {
      records.push({
        source_type: "video",
        source_id: video.id,
        label: video.title,
        gm_only: false,
        payload: { title: video.title, type: video.video_type, storage_path: video.storage_path },
      });
    }
    const soundtrack = await listCampaignSoundtracks(campaignId);
    for (const album of soundtrack.albums) {
      records.push({
        source_type: "soundtrack",
        source_id: album.id,
        label: album.title,
        gm_only: false,
        payload: {
          title: album.title,
          slug: album.slug,
          composer: album.composer,
          tracks: soundtrack.tracks
            .filter((track) => track.album_id === album.id)
            .map((track) => track.title)
            .sort(),
        },
      });
    }
    for (const effect of await listCampaignSoundFx(campaignId)) {
      records.push({
        source_type: "sound_fx",
        source_id: effect.id,
        label: effect.title,
        gm_only: true,
        payload: { title: effect.title, storage_path: effect.storage_path },
      });
    }
  }
  tick("media");

  return buildScanSnapshot(campaignId, campaign.name, records);
}
