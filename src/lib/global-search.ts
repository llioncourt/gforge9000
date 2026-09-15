import { supabase } from "@/integrations/supabase/client";
import { campaignVideoTypeLabel } from "@/lib/campaign-intro";

export type CampaignTab =
  | "media" | "roster" | "lore" | "story" | "graph" | "reveals" | "sessions"
  | "timeline" | "battle" | "library" | "rolls" | "notes" | "members" | "rules";

export type SearchTarget =
  | { kind: "character"; id: string }
  | { kind: "entity"; id: string; from: string }
  | { kind: "campaign"; id: string; tab?: CampaignTab; item?: string }
  | { kind: "library" }
  | { kind: "packs" };

export type SearchHit = {
  id: string;
  group: string;
  label: string;
  sublabel?: string;
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
      supabase.from("entities").select("id,name,kind,campaign_id").ilike("name", pattern).limit(LIMIT),
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
    push({ id: `campaign-${row.id}`, group: "Campaigns", label: row.name, target: { kind: "campaign", id: row.id } });
  for (const row of characters.data ?? [])
    push({
      id: `character-${row.id}`,
      group: "Characters",
      label: row.name,
      ...(row.concept ? { sublabel: row.concept } : {}),
      target: { kind: "character", id: row.id },
    });
  for (const row of entities.data ?? [])
    push({
      id: `entity-${row.id}`,
      group: "World & lore",
      label: row.name,
      sublabel: row.kind,
      target: { kind: "entity", id: row.id, from: row.kind === "EVENT" ? "timeline" : "lore" },
    });
  for (const row of sfx.data ?? [])
    push({
      id: `sfx-${row.id}`,
      group: "Sound FX",
      label: row.title,
      target: { kind: "campaign", id: row.campaign_id, tab: "media" },
    });
  for (const row of albums.data ?? [])
    push({
      id: `album-${row.id}`,
      group: "Soundtrack",
      label: row.title,
      sublabel: "Album",
      target: { kind: "campaign", id: row.campaign_id, tab: "media" },
    });
  for (const row of tracks.data ?? [])
    push({
      id: `track-${row.id}`,
      group: "Soundtrack",
      label: row.title,
      sublabel: "Track",
      target: { kind: "campaign", id: row.campaign_id, tab: "media" },
    });
  for (const row of videos.data ?? [])
    push({
      id: `video-${row.id}`,
      group: "Videos",
      label: row.title,
      sublabel: campaignVideoTypeLabel(row.video_type),
      target: { kind: "campaign", id: row.campaign_id, tab: "media" },
    });
  for (const row of notes.data ?? [])
    push({
      id: `note-${row.id}`,
      group: "Notes & handouts",
      label: row.title,
      sublabel: row.kind,
      target: { kind: "campaign", id: row.campaign_id, tab: "notes" },
    });
  for (const row of assets.data ?? [])
    push({
      id: `asset-${row.id}`,
      group: "Campaign library",
      label: row.title,
      target: { kind: "campaign", id: row.campaign_id, tab: "library" },
    });
  for (const row of maps.data ?? [])
    push({
      id: `map-${row.id}`,
      group: "Battle maps",
      label: row.name,
      target: { kind: "campaign", id: row.campaign_id, tab: "battle" },
    });
  for (const row of library.data ?? [])
    push({ id: `lib-${row.id}`, group: "Rules library", label: row.name, sublabel: row.kind, target: { kind: "library" } });
  for (const row of packs.data ?? [])
    push({
      id: `pack-${row.id}`,
      group: "Content packs",
      label: row.name,
      ...(row.source_label ? { sublabel: row.source_label } : {}),
      target: { kind: "packs" },
    });
  for (const row of rolls.data ?? []) {
    if (!row.campaign_id) continue;
    push({
      id: `roll-${row.id}`,
      group: "Dice rolls",
      label: row.label,
      sublabel: `Total ${row.total}`,
      target: { kind: "campaign", id: row.campaign_id, tab: "rolls" },
    });
  }

  return hits;
}
