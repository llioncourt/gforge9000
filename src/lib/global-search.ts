import { supabase } from "@/integrations/supabase/client";
import { campaignVideoTypeLabel } from "@/lib/campaign-intro";

export type CampaignTab =
  | "media" | "roster" | "lore" | "story" | "graph" | "reveals" | "sessions"
  | "timeline" | "battle" | "library" | "rolls" | "notes" | "members" | "rules";

export type MediaSubTab = "videos" | "soundtrack" | "sound-fx";

export type SearchTarget =
  | { kind: "character"; id: string }
  | { kind: "entity"; id: string; from: string }
  | { kind: "campaign"; id: string; tab?: CampaignTab; item?: string; sub?: MediaSubTab }
  | { kind: "library"; item?: string }
  | { kind: "packs" };

export type SearchHit = {
  id: string;
  groupKey: string;
  label: string;
  labelKey?: string;
  sublabel?: string;
  sublabelKey?: string;
  sublabelParams?: Record<string, string | number>;
  target: SearchTarget;
};

const LIMIT = 6;

function like(term: string) {
  return `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
}

/** Search across everything the signed-in user can see (RLS scopes the rows). */
export async function globalSearch(term: string): Promise<SearchHit[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const pattern = like(q);

  const [campaigns, characters, library, entities, sfx, albums, tracks, videos, notes, assets, maps, packs, rolls] =
    await Promise.all([
      supabase.from("campaigns").select("id,name,description").ilike("name", pattern).limit(LIMIT),
      supabase.from("characters").select("id,name,concept").ilike("name", pattern).limit(LIMIT),
      supabase.from("library_entries").select("id,name,kind").ilike("name", pattern).limit(LIMIT),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC created after types were generated
      (supabase.rpc as any)("list_entities_safe").ilike("name", pattern).limit(LIMIT) as Promise<{
        data: { id: string; name: string; kind: string; campaign_id: string }[] | null;
      }>,
      supabase.from("campaign_sound_fx").select("id,title,campaign_id").ilike("title", pattern).limit(LIMIT),
      supabase.from("campaign_soundtrack_albums").select("id,title,campaign_id").ilike("title", pattern).limit(LIMIT),
      supabase.from("campaign_soundtrack_tracks").select("id,title,campaign_id").ilike("title", pattern).limit(LIMIT),
      supabase.from("campaign_videos").select("id,title,video_type,campaign_id").ilike("title", pattern).limit(LIMIT),
      supabase.from("campaign_notes").select("id,title,kind,campaign_id").ilike("title", pattern).limit(LIMIT),
      supabase.from("campaign_assets").select("id,title,campaign_id").ilike("title", pattern).limit(LIMIT),
      supabase.from("maps").select("id,name,campaign_id").ilike("name", pattern).limit(LIMIT),
      supabase.from("content_packs").select("id,name,source_label").ilike("name", pattern).limit(LIMIT),
      supabase.from("roll_history").select("id,label,total,campaign_id").ilike("label", pattern).limit(LIMIT),
    ]);

  const hits: SearchHit[] = [];
  const push = (hit: SearchHit) => hits.push(hit);

  for (const row of campaigns.data ?? [])
    push({
      id: `campaign-${row.id}`,
      groupKey: "search.groups.campaigns",
      label: row.name,
      target: { kind: "campaign", id: row.id },
    });
  for (const row of characters.data ?? [])
    push({
      id: `character-${row.id}`,
      groupKey: "search.groups.characters",
      label: row.name,
      ...(row.concept ? { sublabel: row.concept } : {}),
      target: { kind: "character", id: row.id },
    });
  for (const row of entities.data ?? []) {
    const kind = row.kind ?? "LORE";
    push({
      id: `entity-${row.id}`,
      groupKey: "search.groups.worldLore",
      label: row.name ?? "",
      ...(row.name ? {} : { labelKey: "search.labels.untitled" }),
      sublabel: kind,
      target: { kind: "entity", id: row.id as string, from: kind === "EVENT" ? "timeline" : "lore" },
    });
  }

  for (const row of sfx.data ?? [])
    push({
      id: `sfx-${row.id}`,
      groupKey: "search.groups.soundFx",
      label: row.title,
      target: { kind: "campaign", id: row.campaign_id, tab: "media", item: row.id, sub: "sound-fx" },
    });
  for (const row of albums.data ?? [])
    push({
      id: `album-${row.id}`,
      groupKey: "search.groups.soundtrack",
      label: row.title,
      sublabelKey: "search.sublabels.album",
      target: { kind: "campaign", id: row.campaign_id, tab: "media", item: row.id, sub: "soundtrack" },
    });
  for (const row of tracks.data ?? [])
    push({
      id: `track-${row.id}`,
      groupKey: "search.groups.soundtrack",
      label: row.title,
      sublabelKey: "search.sublabels.track",
      target: { kind: "campaign", id: row.campaign_id, tab: "media", item: row.id, sub: "soundtrack" },
    });
  for (const row of videos.data ?? [])
    push({
      id: `video-${row.id}`,
      groupKey: "search.groups.videos",
      label: row.title,
      sublabel: campaignVideoTypeLabel(row.video_type),
      target: { kind: "campaign", id: row.campaign_id, tab: "media", item: row.id, sub: "videos" },
    });
  for (const row of notes.data ?? [])
    push({
      id: `note-${row.id}`,
      groupKey: "search.groups.notesHandouts",
      label: row.title,
      sublabel: row.kind,
      target: { kind: "campaign", id: row.campaign_id, tab: "notes", item: row.id },
    });
  for (const row of assets.data ?? [])
    push({
      id: `asset-${row.id}`,
      groupKey: "search.groups.campaignLibrary",
      label: row.title,
      target: { kind: "campaign", id: row.campaign_id, tab: "library", item: row.id },
    });
  for (const row of maps.data ?? [])
    push({
      id: `map-${row.id}`,
      groupKey: "search.groups.battleMaps",
      label: row.name,
      target: { kind: "campaign", id: row.campaign_id, tab: "battle", item: row.id },
    });
  for (const row of library.data ?? [])
    push({
      id: `lib-${row.id}`,
      groupKey: "search.groups.rulesLibrary",
      label: row.name,
      sublabel: row.kind,
      target: { kind: "library", item: row.id },
    });
  for (const row of packs.data ?? [])
    push({
      id: `pack-${row.id}`,
      groupKey: "search.groups.contentPacks",
      label: row.name,
      ...(row.source_label ? { sublabel: row.source_label } : {}),
      target: { kind: "packs" },
    });
  for (const row of rolls.data ?? []) {
    if (!row.campaign_id) continue;
    push({
      id: `roll-${row.id}`,
      groupKey: "search.groups.diceRolls",
      label: row.label,
      sublabelKey: "search.sublabels.total",
      sublabelParams: { total: row.total },
      target: { kind: "campaign", id: row.campaign_id, tab: "rolls", item: row.id },
    });
  }

  return hits;
}
