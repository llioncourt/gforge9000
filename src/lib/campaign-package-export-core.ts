import { zipSync, type Zippable } from "fflate";
import type { Client } from "@/lib/mcp/kit.server";
import { buildCampaignPackageReadme } from "@/lib/campaign-package-docs";
import { toPackageVisibility } from "@/lib/visibility";
import { slugify } from "@/lib/portable";
import type { CampaignPackageManifest } from "@/lib/campaign-package";

/**
 * Server-safe core of the campaign package exporter.
 *
 * `src/lib/campaign-package-export.ts` (the browser exporter) reaches this
 * same logic through helpers like `getCampaign`/`listEntities`/`listMaps`
 * that import the browser Supabase singleton at module scope. Those helpers
 * cannot be imported from the Worker-safe MCP surface, so the IO glue (plain
 * SELECTs against the same tables, with the same columns) is written directly
 * against an injected client here. The business rules — the manifest shape,
 * visibility mapping, identity — are not duplicated: they live in
 * `@/lib/campaign-package(-docs)` and `@/lib/visibility`, both pure and
 * imported by both the browser exporter and this core.
 *
 * Bucket names below mirror the single source of truth in each browser lib
 * module (`src/lib/assets.ts`, `battlemap.ts`, `campaign-intro.ts`,
 * `campaign-sound-fx.ts`, `campaign-soundtrack.ts`, `portrait.ts`).
 */

const ASSET_BUCKET = "lore-assets";
const MAP_BUCKET = "maps";
const CAMPAIGN_INTRO_BUCKET = "campaign-intros";
const CAMPAIGN_SOUND_FX_BUCKET = "campaign-sound-fx";
const CAMPAIGN_SOUNDTRACK_BUCKET = "campaign-soundtracks";
const PORTRAIT_BUCKET = "portraits";

type Visibility = "gm" | "players" | "public";

const VIDEO_TYPES = [
  "intro",
  "recap",
  "cutscene",
  "trailer",
  "handout",
  "vision",
  "dream",
  "other",
] as const;
type VideoType = (typeof VIDEO_TYPES)[number];

function extensionOf(path: string, fallback: string) {
  const ext = path.split("/").pop()?.split(".").pop();
  return ext && ext.length <= 5 ? ext.toLowerCase() : fallback;
}

function visibilityOf(value: string): Visibility {
  return toPackageVisibility(value);
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

async function downloadBytes(
  supabase: Client,
  bucket: string,
  path: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Entity/library images can live in either bucket, so try both. */
async function downloadImage(supabase: Client, path: string): Promise<Uint8Array | null> {
  return (
    (await downloadBytes(supabase, PORTRAIT_BUCKET, path)) ??
    (await downloadBytes(supabase, ASSET_BUCKET, path))
  );
}

async function copy(
  supabase: Client,
  bundle: Bundle,
  bucket: string,
  storagePath: string | null | undefined,
  folder: string,
  base: string,
  fallbackExt: string,
): Promise<string | null> {
  if (!storagePath) return null;
  const bytes =
    bucket === "auto"
      ? await downloadImage(supabase, storagePath)
      : await downloadBytes(supabase, bucket, storagePath);
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

export interface CampaignExportResult {
  bytes: Uint8Array;
  fileName: string;
}

/**
 * Builds a full campaign package ZIP (README.md + campaign.json + every file)
 * against an injected, RLS-scoped Supabase client. Used by both the browser
 * exporter (with the signed-in browser client) and the assistant's `export`
 * action (with the caller's own RLS-scoped client) — never a service role.
 */
export async function buildCampaignPackageZipCore(
  supabase: Client,
  campaignId: string,
  onProgress?: CampaignExportProgress,
): Promise<CampaignExportResult> {
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
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaign) throw new Error(campaignError?.message ?? "Campaign not found.");

  const [
    notesResult,
    entitiesResult,
    relationshipsResult,
    assetsResult,
    mapsResult,
    videosResult,
    soundFxResult,
    albumsResult,
    tracksResult,
    characterRowsResult,
  ] = await Promise.all([
    supabase.from("campaign_notes").select("*").eq("campaign_id", campaignId),
    // Same visibility rules as the app: the GM exporting sees everything, so a
    // plain table read (RLS lets the GM read all their campaign's entities) is
    // equivalent to the app's `list_entities_safe` RPC for this caller.
    supabase
      .from("entities")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("kind")
      .order("sort_order")
      .order("name"),
    supabase.from("entity_relationships").select("*").eq("campaign_id", campaignId),
    supabase
      .from("campaign_assets")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
    supabase.from("maps").select("*").eq("campaign_id", campaignId).order("created_at"),
    supabase.from("campaign_videos").select("*").eq("campaign_id", campaignId).order("created_at"),
    supabase
      .from("campaign_sound_fx")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("campaign_soundtrack_albums")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at"),
    supabase
      .from("campaign_soundtrack_tracks")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("position"),
    supabase.from("characters").select("*").eq("campaign_id", campaignId).order("created_at"),
  ]);
  for (const result of [
    notesResult,
    entitiesResult,
    relationshipsResult,
    assetsResult,
    mapsResult,
    videosResult,
    soundFxResult,
    albumsResult,
    tracksResult,
    characterRowsResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }
  const notes = notesResult.data ?? [];
  const entities = entitiesResult.data ?? [];
  const relationships = relationshipsResult.data ?? [];
  const assets = assetsResult.data ?? [];
  const maps = mapsResult.data ?? [];
  const videos = videosResult.data ?? [];
  const soundFx = soundFxResult.data ?? [];
  const albums = albumsResult.data ?? [];
  const tracks = tracksResult.data ?? [];
  const characterRows = characterRowsResult.data ?? [];

  const mapObjectsByMap = new Map<string, { data: unknown; [key: string]: unknown }[]>();
  for (const map of maps) {
    const { data: objects, error } = await supabase
      .from("map_objects")
      .select("*")
      .eq("map_id", map.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    mapObjectsByMap.set(map.id, (objects ?? []) as { data: unknown; [key: string]: unknown }[]);
  }

  const entriesByCharacter = new Map<string, { data: unknown; [key: string]: unknown }[]>();
  for (const row of characterRows) {
    const { data: entries, error } = await supabase
      .from("character_entries")
      .select("*")
      .eq("character_id", row.id)
      .order("kind")
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    entriesByCharacter.set(row.id, (entries ?? []) as { data: unknown; [key: string]: unknown }[]);
  }

  total =
    1 +
    characterRows.length +
    entities.length +
    assets.length +
    maps.length +
    videos.length +
    soundFx.length +
    albums.length +
    tracks.length +
    1;
  done = 1;
  emit();

  const rawSettings = (campaign.settings ?? {}) as Record<string, unknown>;
  const settings: NonNullable<CampaignPackageManifest["campaign"]["settings"]> = {};
  if (typeof rawSettings["point_limit"] === "number")
    settings.point_limit = rawSettings["point_limit"];
  if (typeof rawSettings["disadvantage_limit"] === "number")
    settings.disadvantage_limit = rawSettings["disadvantage_limit"];
  if (typeof rawSettings["quirk_limit"] === "number")
    settings.quirk_limit = rawSettings["quirk_limit"];
  if (typeof rawSettings["tech_level"] === "number")
    settings.tech_level = rawSettings["tech_level"];
  if (typeof rawSettings["house_rules"] === "string")
    settings.house_rules = rawSettings["house_rules"];
  if (Array.isArray(rawSettings["allowed_sources"]))
    settings.allowed_sources = (rawSettings["allowed_sources"] as unknown[]).filter(
      (value): value is string => typeof value === "string",
    );
  if (Array.isArray(rawSettings["allowed_packs"]))
    settings.allowed_packs = (rawSettings["allowed_packs"] as unknown[]).filter(
      (value): value is string => typeof value === "string",
    );

  // --- characters -----------------------------------------------------------
  step("Exporting characters…");
  const characterKeyById = new Map<string, string>();
  const manifestCharacters: CampaignPackageManifest["characters"] = [];
  for (const row of characterRows) {
    const entries = entriesByCharacter.get(row.id) ?? [];
    const portable = {
      format: "universal-character-forge" as const,
      version: 1 as const,
      exported_at: new Date().toISOString(),
      character: {
        id: row.id,
        name: row.name,
        player_name: row.player_name,
        concept: row.concept,
        point_budget: row.point_budget,
        tech_level: row.tech_level,
        st: row.st,
        dx: row.dx,
        iq: row.iq,
        ht: row.ht,
        hp_delta: row.hp_delta,
        will_delta: row.will_delta,
        per_delta: row.per_delta,
        fp_delta: row.fp_delta,
        speed_delta: Number(row.speed_delta),
        move_delta: row.move_delta,
        current_hp: row.current_hp,
        current_fp: row.current_fp,
        conditions: row.conditions ?? [],
        wealth: row.wealth,
        status: row.status,
        notes: row.notes,
        is_npc: row.is_npc,
        approved: row.approved,
      },
      entries: entries.map((entry) => {
        const e = entry as unknown as Record<string, unknown>;
        return {
          kind: e["kind"],
          name: e["name"],
          category: e["category"],
          points: e["points"],
          levels: e["levels"],
          data: e["data"] ?? {},
          notes: e["notes"],
          source: e["source"] ?? {},
          sort_order: e["sort_order"],
        };
      }),
    };
    const jsonPath = bundle.reserve("characters", row.name, "json");
    bundle.add(jsonPath, new TextEncoder().encode(JSON.stringify(portable, null, 2)));
    const portraitPath = await copy(
      supabase,
      bundle,
      PORTRAIT_BUCKET,
      row.portrait_path,
      "images",
      `${row.name}-portrait`,
      "avif",
    );
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
    const imagePath = await copy(
      supabase,
      bundle,
      "auto",
      entity.image_url,
      "images",
      entity.name,
      "avif",
    );
    const parentKey = entity.parent_id ? entityKeyById.get(entity.parent_id) : undefined;
    const characterKey = entity.character_id
      ? characterKeyById.get(entity.character_id)
      : undefined;
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
    const file = await copy(
      supabase,
      bundle,
      ASSET_BUCKET,
      asset.storage_path,
      "assets",
      asset.title,
      "bin",
    );
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
    const image = await copy(
      supabase,
      bundle,
      MAP_BUCKET,
      map.image_path,
      "maps",
      map.name,
      "webp",
    );
    const objects = mapObjectsByMap.get(map.id) ?? [];
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
      objects: await Promise.all(
        objects.map(async (raw) => {
          const object = raw as unknown as Record<string, unknown>;
          const characterKey = object["character_id"]
            ? characterKeyById.get(object["character_id"] as string)
            : undefined;
          const data = { ...((object["data"] ?? {}) as Record<string, unknown>) };
          const entityId = typeof data["entity_id"] === "string" ? data["entity_id"] : undefined;
          const entityKey = entityId ? entityKeyById.get(entityId) : undefined;
          delete data["entity_id"];
          const imageFile = await copy(
            supabase,
            bundle,
            "auto",
            object["image_url"] as string | null | undefined,
            "images",
            String(object["label"] ?? "token"),
            "avif",
          );
          return {
            kind: object["kind"] as string,
            label: object["label"] as string,
            x: object["x"] as number,
            y: object["y"] as number,
            size: object["size"] as number,
            rotation: object["rotation"] as number,
            color: object["color"] as string | null | undefined,
            hidden: object["hidden"] as boolean,
            data,
            ...(characterKey ? { character_key: characterKey } : {}),
            ...(entityKey ? { entity_key: entityKey } : {}),
            ...(imageFile ? { image_file: imageFile } : {}),
          };
        }),
      ),
    });
    tick();
  }

  // --- media ----------------------------------------------------------------
  step("Exporting videos…");
  const manifestVideos: CampaignPackageManifest["videos"] = [];
  for (const video of videos) {
    const file = await copy(
      supabase,
      bundle,
      CAMPAIGN_INTRO_BUCKET,
      video.storage_path,
      "videos",
      video.title,
      "mp4",
    );
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
    const file = await copy(
      supabase,
      bundle,
      CAMPAIGN_SOUND_FX_BUCKET,
      effect.storage_path,
      "sounds",
      effect.title,
      "mp3",
    );
    tick();
    if (file) manifestSoundFx.push({ title: effect.title, file });
  }

  step("Exporting soundtrack…");
  const manifestAlbums: CampaignPackageManifest["soundtracks"] = [];
  for (const album of albums) {
    const cover = await copy(
      supabase,
      bundle,
      CAMPAIGN_SOUNDTRACK_BUCKET,
      album.cover_path,
      "soundtracks",
      `${album.slug}-cover`,
      "jpg",
    );
    tick();
    if (!cover) continue;
    const albumTracks = tracks
      .filter((track) => track.album_id === album.id)
      .sort((a, b) => a.position - b.position);
    const manifestTracks: CampaignPackageManifest["soundtracks"][number]["tracks"] = [];
    for (const [index, track] of albumTracks.entries()) {
      const file = await copy(
        supabase,
        bundle,
        CAMPAIGN_SOUNDTRACK_BUCKET,
        track.storage_path,
        `soundtracks/${album.slug}`,
        track.title,
        "mp3",
      );
      tick();
      if (!file) continue;
      manifestTracks.push({
        position: index + 1,
        title: track.title,
        composer: track.composer,
        duration_seconds: track.duration_seconds,
        file,
        lyrics: (track as { lyrics?: string | null }).lyrics ?? null,
      });
    }
    if (!manifestTracks.length) continue;
    manifestAlbums.push({
      slug: album.slug,
      title: album.title,
      subtitle: album.subtitle,
      description: album.description,
      composer: album.composer,
      release_year: album.release_year,
      game_slug: (album as { game_slug?: string | null }).game_slug ?? null,
      status:
        (album as { status?: string | null }).status === "draft"
          ? ("draft" as const)
          : ("published" as const),
      cover,
      tracks: manifestTracks,
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
  return { bytes: zipped, fileName: `${slugify(campaign.name) || "campaign"}-package.zip` };
}
