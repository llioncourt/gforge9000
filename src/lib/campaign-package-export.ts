import { zipSync, type Zippable } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import { getCampaign, listEntries, listNotes, toCharacterRecord, toEntry } from "@/lib/api";
import { ASSET_BUCKET, listAssets } from "@/lib/assets";
import { MAP_BUCKET, listMapObjects, listMaps } from "@/lib/battlemap";
import { CAMPAIGN_INTRO_BUCKET, listCampaignVideos } from "@/lib/campaign-intro";
import { CAMPAIGN_SOUND_FX_BUCKET, listCampaignSoundFx } from "@/lib/campaign-sound-fx";
import { CAMPAIGN_SOUNDTRACK_BUCKET, listCampaignSoundtracks } from "@/lib/campaign-soundtrack";
import { buildCampaignPackageReadme } from "@/lib/campaign-package-docs";
import { listEntities, listRelationships } from "@/lib/lore";
import { PORTRAIT_BUCKET } from "@/lib/portrait";
import { toPortable } from "@/lib/portable";
import { slugify } from "@/lib/portable";
import type { CampaignPackageManifest } from "@/lib/campaign-package";

type Visibility = "gm" | "players" | "public";

const VIDEO_TYPES = ["intro", "recap", "cutscene", "trailer", "handout", "vision", "dream", "other"] as const;
type VideoType = (typeof VIDEO_TYPES)[number];

function extensionOf(path: string, fallback: string) {
  const ext = path.split("/").pop()?.split(".").pop();
  return ext && ext.length <= 5 ? ext.toLowerCase() : fallback;
}

function visibilityOf(value: string): Visibility {
  return value === "players" || value === "public" ? value : "gm";
}

function gridTypeOf(value: string): "square" | "hex" | "none" {
  return value === "square" || value === "none" ? value : "hex";
}

/** Collects the ZIP entries while keeping every path unique. */
class Bundle {
  readonly files: Zippable = {};
  private used = new Set<string>();

  reserve(folder: string, base: string, ext: string) {
    const stem = slugify(base) || "file";
    let path = `${folder}/${stem}.${ext}`;
    let n = 2;
    while (this.used.has(path)) path = `${folder}/${stem}-${n++}.${ext}`;
    this.used.add(path);
    return path;
  }

  add(path: string, bytes: Uint8Array) {
    (this.files as Record<string, Uint8Array>)[path] = bytes;
  }
}

async function downloadBytes(bucket: string, path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Entity/library images can live in either bucket, so try both. */
async function downloadImage(path: string): Promise<Uint8Array | null> {
  return (await downloadBytes(PORTRAIT_BUCKET, path)) ?? (await downloadBytes(ASSET_BUCKET, path));
}

async function copy(
  bundle: Bundle,
  bucket: string,
  storagePath: string | null | undefined,
  folder: string,
  base: string,
  fallbackExt: string,
): Promise<string | null> {
  if (!storagePath) return null;
  const bytes =
    bucket === "auto" ? await downloadImage(storagePath) : await downloadBytes(bucket, storagePath);
  if (!bytes) return null;
  const path = bundle.reserve(folder, base, extensionOf(storagePath, fallbackExt));
  bundle.add(path, bytes);
  return path;
}

export interface CampaignExportStep {
  label: string;
  done: number;
  total: number;
  percent: number;
}

export interface CampaignExportProgress {
  (step: CampaignExportStep): void;
}

/**
 * Builds a full campaign package ZIP (README.md + campaign.json + every file)
 * that can be re-imported with the campaign package importer.
 */
export async function buildCampaignPackageZip(
  campaignId: string,
  onProgress?: CampaignExportProgress,
): Promise<{ blob: Blob; fileName: string }> {
  let done = 0;
  let total = 1;
  let label = "Reading campaign…";
  const emit = () =>
    onProgress?.({
      label,
      done,
      total,
      percent: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
    });
  const step = (next: string) => {
    label = next;
    emit();
  };
  const tick = () => {
    done = Math.min(done + 1, total);
    emit();
  };
  const bundle = new Bundle();

  step("Reading campaign…");
  const campaign = await getCampaign(campaignId);
  const [notes, entities, relationships, assets, maps, videos, soundFx, soundtracks] = await Promise.all([
    listNotes(campaignId),
    listEntities(campaignId),
    listRelationships(campaignId),
    listAssets(campaignId),
    listMaps(campaignId),
    listCampaignVideos(campaignId),
    listCampaignSoundFx(campaignId),
    listCampaignSoundtracks(campaignId),
  ]);
  const { data: characterRows } = await supabase
    .from("characters")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at");

  total =
    1 +
    (characterRows?.length ?? 0) +
    entities.length +
    assets.length +
    maps.length +
    videos.length +
    soundFx.length +
    soundtracks.albums.length +
    soundtracks.tracks.length +
    1;
  done = 1;
  emit();


  const rawSettings = (campaign.settings ?? {}) as Record<string, unknown>;
  const settings: NonNullable<CampaignPackageManifest["campaign"]["settings"]> = {};
  if (typeof rawSettings["point_limit"] === "number") settings.point_limit = rawSettings["point_limit"];
  if (typeof rawSettings["disadvantage_limit"] === "number")
    settings.disadvantage_limit = rawSettings["disadvantage_limit"];
  if (typeof rawSettings["tech_level"] === "number") settings.tech_level = rawSettings["tech_level"];
  if (typeof rawSettings["house_rules"] === "string") settings.house_rules = rawSettings["house_rules"];
  if (Array.isArray(rawSettings["allowed_sources"]))
    settings.allowed_sources = (rawSettings["allowed_sources"] as unknown[]).filter(
      (value): value is string => typeof value === "string",
    );

  // --- characters -----------------------------------------------------------
  step("Exporting characters…");
  const characterKeyById = new Map<string, string>();
  const manifestCharacters: CampaignPackageManifest["characters"] = [];
  for (const row of characterRows ?? []) {
    const entries = await listEntries(row.id);
    const portable = toPortable(toCharacterRecord(row), entries.map(toEntry));
    const jsonPath = bundle.reserve("characters", row.name, "json");
    bundle.add(jsonPath, new TextEncoder().encode(JSON.stringify(portable, null, 2)));
    const portraitPath = await copy(bundle, PORTRAIT_BUCKET, row.portrait_path, "images", `${row.name}-portrait`, "avif");
    const key = `char:${row.id}`;
    characterKeyById.set(row.id, key);
    manifestCharacters.push({
      key,
      file: jsonPath,
      is_npc: row.is_npc,
      ...(portraitPath ? { portrait_file: portraitPath } : {}),
    });
    tick();
  }

  // --- lore -----------------------------------------------------------------
  step("Exporting world & lore…");
  const entityKeyById = new Map<string, string>();
  for (const entity of entities) entityKeyById.set(entity.id, `entity:${entity.id}`);
  const manifestEntities: CampaignPackageManifest["lore"]["entities"] = [];
  for (const entity of entities) {
    const imagePath = await copy(bundle, "auto", entity.image_url, "images", entity.name, "avif");
    const parentKey = entity.parent_id ? entityKeyById.get(entity.parent_id) : undefined;
    const characterKey = entity.character_id ? characterKeyById.get(entity.character_id) : undefined;
    manifestEntities.push({
      key: entityKeyById.get(entity.id)!,
      kind: entity.kind,
      name: entity.name,
      status: entity.status,
      visibility: visibilityOf(entity.visibility),
      summary: entity.summary,
      description: entity.description,
      player_description: entity.player_description,
      gm_notes: entity.gm_notes,
      aliases: entity.aliases ?? [],
      tags: entity.tags ?? [],
      sort_order: entity.sort_order,
      data: (entity.data ?? {}) as Record<string, unknown>,
      ...(parentKey ? { parent_key: parentKey } : {}),
      ...(characterKey ? { character_key: characterKey } : {}),
      ...(imagePath ? { image_file: imagePath } : {}),
    });
    tick();
  }
  const manifestRelationships: CampaignPackageManifest["lore"]["relationships"] = relationships
    .filter((rel) => entityKeyById.has(rel.source_id) && entityKeyById.has(rel.target_id))
    .map((rel) => ({
      source_key: entityKeyById.get(rel.source_id)!,
      target_key: entityKeyById.get(rel.target_id)!,
      rel_type: rel.rel_type,
      description: rel.description,
      gm_description: rel.gm_description,
      start_label: rel.start_label,
      end_label: rel.end_label,
      strength: rel.strength,
      is_current: rel.is_current,
      visibility: visibilityOf(rel.visibility),
    }));

  // --- assets ---------------------------------------------------------------
  step("Exporting campaign library…");
  const manifestAssets: CampaignPackageManifest["assets"] = [];
  for (const asset of assets) {
    const file = await copy(bundle, ASSET_BUCKET, asset.storage_path, "assets", asset.title, "bin");
    tick();
    if (!file) continue;
    manifestAssets.push({
      title: asset.title,
      caption: asset.caption,
      tags: asset.tags ?? [],
      visible_to_players: asset.visible_to_players,
      file,
    });
  }

  // --- maps -----------------------------------------------------------------
  step("Exporting battle maps…");
  const manifestMaps: CampaignPackageManifest["maps"] = [];
  for (const map of maps) {
    const image = await copy(bundle, MAP_BUCKET, map.image_path, "maps", map.name, "webp");
    const objects = await listMapObjects(map.id);
    manifestMaps.push({
      name: map.name,
      grid_type: gridTypeOf(map.grid_type),
      grid_size: map.grid_size,
      grid_offset_x: map.grid_offset_x,
      grid_offset_y: map.grid_offset_y,
      unit_per_cell: map.unit_per_cell,
      unit_name: map.unit_name,
      is_active: map.is_active,
      visible_to_players: map.visible_to_players,
      ...(image ? { file: image } : {}),
      objects: objects.map((object) => {
        const characterKey = object.character_id ? characterKeyById.get(object.character_id) : undefined;
        return {
          kind: object.kind,
          label: object.label,
          x: object.x,
          y: object.y,
          size: object.size,
          rotation: object.rotation,
          color: object.color,
          hidden: object.hidden,
          data: (object.data ?? {}) as Record<string, unknown>,
          ...(characterKey ? { character_key: characterKey } : {}),
        };
      }),
    });
    tick();
  }

  // --- media ----------------------------------------------------------------
  step("Exporting videos…");
  const manifestVideos: CampaignPackageManifest["videos"] = [];
  for (const video of videos) {
    const file = await copy(bundle, CAMPAIGN_INTRO_BUCKET, video.storage_path, "videos", video.title, "mp4");
    tick();
    if (!file) continue;
    const type = (VIDEO_TYPES as readonly string[]).includes(video.video_type)
      ? (video.video_type as VideoType)
      : "other";
    manifestVideos.push({ title: video.title, type, file });
  }

  step("Exporting sound FX…");
  const manifestSoundFx: CampaignPackageManifest["sound_fx"] = [];
  for (const effect of soundFx) {
    const file = await copy(bundle, CAMPAIGN_SOUND_FX_BUCKET, effect.storage_path, "sounds", effect.title, "mp3");
    tick();
    if (file) manifestSoundFx.push({ title: effect.title, file });
  }

  step("Exporting soundtrack…");
  const manifestAlbums: CampaignPackageManifest["soundtracks"] = [];
  for (const album of soundtracks.albums) {
    const cover = await copy(
      bundle,
      CAMPAIGN_SOUNDTRACK_BUCKET,
      album.cover_path,
      "soundtracks",
      `${album.slug}-cover`,
      "jpg",
    );
    tick();
    if (!cover) continue;
    const albumTracks = soundtracks.tracks
      .filter((track) => track.album_id === album.id)
      .sort((a, b) => a.position - b.position);
    const tracks: CampaignPackageManifest["soundtracks"][number]["tracks"] = [];
    for (const [index, track] of albumTracks.entries()) {
      const file = await copy(
        bundle,
        CAMPAIGN_SOUNDTRACK_BUCKET,
        track.storage_path,
        `soundtracks/${album.slug}`,
        track.title,
        "mp3",
      );
      tick();
      if (!file) continue;
      tracks.push({
        position: index + 1,
        title: track.title,
        composer: track.composer,
        duration_seconds: track.duration_seconds,
        file,
      });
    }
    if (!tracks.length) continue;
    manifestAlbums.push({
      slug: album.slug,
      title: album.title,
      subtitle: album.subtitle,
      description: album.description,
      composer: album.composer,
      release_year: album.release_year,
      cover,
      tracks,
    });
  }

  const manifest: CampaignPackageManifest = {
    format: "ucf-campaign-package",
    version: 1,
    exported_at: new Date().toISOString(),
    campaign: {
      name: campaign.name,
      description: campaign.description,
      ...(Object.keys(settings).length ? { settings } : {}),
    },
    notes: notes.map((note) => ({
      kind: (["note", "handout", "session", "session-prep", "rule"] as const).includes(
        note.kind as "note",
      )
        ? (note.kind as "note")
        : "note",
      title: note.title,
      body: note.body ?? "",
      gm_only: note.gm_only,
    })),
    lore: { entities: manifestEntities, relationships: manifestRelationships },
    assets: manifestAssets,
    maps: manifestMaps,
    videos: manifestVideos,
    soundtracks: manifestAlbums,
    sound_fx: manifestSoundFx,
    characters: manifestCharacters,
  };

  step("Packing ZIP…");
  bundle.add("campaign.json", new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
  bundle.add("README.md", new TextEncoder().encode(buildCampaignPackageReadme()));
  const zipped = zipSync(bundle.files, { level: 6 });
  const blob = new Blob([zipped.slice().buffer as ArrayBuffer], { type: "application/zip" });
  return { blob, fileName: `${slugify(campaign.name) || "campaign"}-package.zip` };
}
