import { unzipSync } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import { createCampaign } from "@/lib/api";
import { createAsset, uploadAssetFile, validateAssetFile } from "@/lib/assets";
import { createMap, createMapObject, uploadMapImage } from "@/lib/battlemap";
import { uploadCampaignIntro } from "@/lib/campaign-intro";
import { importCampaignSoundtrack } from "@/lib/campaign-soundtrack";
import { soundtrackAudioMime } from "@/lib/campaign-soundtrack-pack";
import {
  MAX_CAMPAIGN_PACKAGE_BYTES,
  parseCampaignPackageManifest,
  referencedFiles,
  validateCampaignPackage,
  type CampaignImportSummary,
  type CampaignPackageManifest,
} from "@/lib/campaign-package";
import { convertToAvif, isImageFile } from "@/lib/image-avif";
import { createEntity, createRelationship, updateEntity } from "@/lib/lore";
import { uploadPortrait } from "@/lib/portrait";
import { parsePortable } from "@/lib/portable";
import type { TablesInsert } from "@/integrations/supabase/types";

type Archive = Record<string, Uint8Array>;

function bytesFromZip(archive: Archive, path: string): Uint8Array {
  const bytes = archive[path] ?? archive[path.replace(/^\.\//, "")];
  if (!bytes) throw new Error(`The package is missing "${path}".`);
  return bytes;
}

function fileFromZip(archive: Archive, path: string): File {
  const bytes = archive[path] ?? archive[path.replace(/^\.\//, "")];
  if (!bytes) throw new Error(`The package is missing "${path}".`);
  const name = path.split("/").pop() || "file";
  return new File([bytes.slice().buffer as ArrayBuffer], name);
}

async function bytesAsAvif(archive: Archive, path: string): Promise<Uint8Array> {
  const file = fileFromZip(archive, path);
  if (/\.avif$/i.test(path)) return new Uint8Array(await file.arrayBuffer());
  if (!isImageFile(file)) throw new Error(`"${path}" is not an image file.`);
  const converted = await convertToAvif(file);
  return new Uint8Array(await converted.arrayBuffer());
}

/**
 * Imports a campaign package ZIP as a brand new campaign owned by the signed-in
 * user. The manifest is fully validated before any row is written; if a later
 * step fails the campaign is removed so nothing half-imported is left behind.
 */
export async function importCampaignPackage(
  file: File,
  onProgress?: (step: string) => void,
): Promise<CampaignImportSummary> {
  if (file.size > MAX_CAMPAIGN_PACKAGE_BYTES) {
    throw new Error(`The package is larger than ${Math.round(MAX_CAMPAIGN_PACKAGE_BYTES / 1024 / 1024)} MB.`);
  }
  const step = (label: string) => onProgress?.(label);
  step("Reading package…");
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer())) as Archive;
  const manifestBytes = archive["campaign.json"];
  if (!manifestBytes) throw new Error("The package must contain campaign.json at its root.");
  const manifest = parseCampaignPackageManifest(new TextDecoder().decode(manifestBytes));

  const problems = validateCampaignPackage(manifest);
  if (problems.length) throw new Error(problems[0]!);
  const missing = referencedFiles(manifest).filter(
    (path) => !archive[path] && !archive[path.replace(/^\.\//, "")],
  );
  if (missing.length) throw new Error(`The package is missing "${missing[0]}".`);

  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");

  step("Creating campaign…");
  const campaign = await createCampaign({
    name: manifest.campaign.name,
    description: manifest.campaign.description ?? null,
    settings: {
      point_limit: manifest.campaign.settings?.point_limit ?? 150,
      disadvantage_limit: manifest.campaign.settings?.disadvantage_limit ?? -50,
      tech_level: manifest.campaign.settings?.tech_level ?? 8,
      house_rules: manifest.campaign.settings?.house_rules ?? "",
      allowed_sources: manifest.campaign.settings?.allowed_sources ?? ["user"],
    },
  });

  const summary: CampaignImportSummary = {
    campaignId: campaign.id,
    notes: 0,
    entities: 0,
    relationships: 0,
    assets: 0,
    maps: 0,
    mapObjects: 0,
    albums: 0,
    tracks: 0,
    characters: 0,
    intro: false,
  };

  try {
    const ids: ImportIds = { characters: new Map(), entities: new Map() };
    await importCharacters(manifest, archive, campaign.id, user.id, summary, step, ids);
    await importLoreSection(manifest, archive, campaign.id, user.id, summary, step, ids);
    await importNotes(manifest, campaign.id, user.id, summary, step);
    await importAssets(manifest, archive, campaign.id, user.id, summary, step);
    await importMaps(manifest, archive, campaign.id, user.id, summary, step, ids);
    await importSoundtracks(manifest, archive, campaign.id, summary, step);
    if (manifest.intro) {
      step("Uploading intro video…");
      await uploadCampaignIntro(campaign.id, fileFromZip(archive, manifest.intro.file));
      summary.intro = true;
    }
  } catch (error) {
    await supabase.from("campaigns").delete().eq("id", campaign.id);
    throw error;
  }

  return summary;
}

/* ---------- sections ---------- */

interface ImportIds {
  characters: Map<string, string>;
  entities: Map<string, string>;
}

async function importCharacters(
  manifest: CampaignPackageManifest,
  archive: Archive,
  campaignId: string,
  userId: string,
  summary: CampaignImportSummary,
  step: (label: string) => void,
  ids: ImportIds,
) {
  if (!manifest.characters.length) return;
  step("Importing characters…");
  for (const entry of manifest.characters) {
    const portable = parsePortable(new TextDecoder().decode(bytesFromZip(archive, entry.file)));
    const record = portable.character;
    const insert: TablesInsert<"characters"> = {
      owner_id: userId,
      campaign_id: campaignId,
      name: record.name,
      player_name: record.player_name ?? null,
      concept: record.concept ?? null,
      point_budget: record.point_budget,
      tech_level: record.tech_level,
      st: record.st,
      dx: record.dx,
      iq: record.iq,
      ht: record.ht,
      hp_delta: record.hp_delta,
      will_delta: record.will_delta,
      per_delta: record.per_delta,
      fp_delta: record.fp_delta,
      speed_delta: record.speed_delta,
      move_delta: record.move_delta,
      current_hp: record.current_hp ?? null,
      current_fp: record.current_fp ?? null,
      conditions: record.conditions ?? [],
      wealth: record.wealth,
      status: record.status,
      notes: record.notes ?? null,
      is_npc: entry.is_npc ?? record.is_npc ?? false,
      approved: record.approved ?? false,
    };
    const { data: created, error } = await supabase
      .from("characters")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    ids.characters.set(entry.key, created.id);

    if (portable.entries.length) {
      const rows = portable.entries.map((item, index) => ({
        character_id: created.id,
        kind: item.kind,
        name: item.name,
        category: item.category ?? null,
        points: item.points,
        levels: item.levels,
        data: (item.data ?? {}) as NonNullable<TablesInsert<"character_entries">["data"]>,
        notes: item.notes ?? null,
        source: (item.source ?? {}) as NonNullable<TablesInsert<"character_entries">["source"]>,
        sort_order: item.sort_order ?? index,
      }));
      const entriesResult = await supabase.from("character_entries").insert(rows);
      if (entriesResult.error) throw new Error(entriesResult.error.message);
    }

    if (entry.portrait_file) {
      const path = await uploadPortrait(created.id, fileFromZip(archive, entry.portrait_file));
      const update = await supabase.from("characters").update({ portrait_path: path }).eq("id", created.id);
      if (update.error) throw new Error(update.error.message);
    }
    summary.characters += 1;
  }
}

async function importLoreSection(
  manifest: CampaignPackageManifest,
  archive: Archive,
  campaignId: string,
  userId: string,
  summary: CampaignImportSummary,
  step: (label: string) => void,
  ids: ImportIds,
) {
  const { entities, relationships } = manifest.lore;
  if (!entities.length) return;
  step("Importing lore…");

  for (const entity of entities) {
    let imagePath: string | null = null;
    if (entity.image_file) {
      imagePath = await uploadLoreImage(archive, entity.image_file, campaignId, userId);
    }
    const data: Record<string, unknown> = { ...entity.data };
    if (entity.character_key) data["character_sheet_id"] = ids.characters.get(entity.character_key) ?? null;
    const created = await createEntity({
      campaign_id: campaignId,
      kind: entity.kind,
      name: entity.name,
      status: entity.status,
      visibility: entity.visibility,
      summary: entity.summary ?? null,
      description: entity.description ?? null,
      player_description: entity.player_description ?? null,
      gm_notes: entity.gm_notes ?? null,
      aliases: entity.aliases,
      tags: entity.tags,
      sort_order: entity.sort_order,
      image_url: imagePath,
      character_id: entity.character_key ? (ids.characters.get(entity.character_key) ?? null) : null,
      data: data as NonNullable<TablesInsert<"entities">["data"]>,
    });
    ids.entities.set(entity.key, created.id);
    summary.entities += 1;
  }

  for (const entity of entities) {
    if (!entity.parent_key) continue;
    const id = ids.entities.get(entity.key);
    const parentId = ids.entities.get(entity.parent_key);
    if (id && parentId) await updateEntity(id, { parent_id: parentId });
  }

  for (const rel of relationships) {
    const sourceId = ids.entities.get(rel.source_key);
    const targetId = ids.entities.get(rel.target_key);
    if (!sourceId || !targetId) continue;
    await createRelationship({
      campaign_id: campaignId,
      source_id: sourceId,
      target_id: targetId,
      rel_type: rel.rel_type,
      description: rel.description ?? null,
      gm_description: rel.gm_description ?? null,
      start_label: rel.start_label ?? null,
      end_label: rel.end_label ?? null,
      strength: rel.strength ?? null,
      is_current: rel.is_current,
      visibility: rel.visibility,
    });
    summary.relationships += 1;
  }
}

async function uploadLoreImage(archive: Archive, path: string, campaignId: string, userId: string) {
  const source = fileFromZip(archive, path);
  const avif = /\.avif$/i.test(path) ? source : await convertToAvif(source);
  const storagePath = `${userId}/${campaignId}/${crypto.randomUUID()}.avif`;
  const { error } = await supabase.storage
    .from("lore-assets")
    .upload(storagePath, avif, { contentType: "image/avif", upsert: false });
  if (error) throw new Error(error.message);
  return storagePath;
}

async function importNotes(
  manifest: CampaignPackageManifest,
  campaignId: string,
  userId: string,
  summary: CampaignImportSummary,
  step: (label: string) => void,
) {
  if (!manifest.notes.length) return;
  step("Importing notes…");
  const rows = manifest.notes.map((note) => ({
    campaign_id: campaignId,
    author_id: userId,
    kind: note.kind,
    title: note.title,
    body: note.body,
    gm_only: note.gm_only,
  }));
  const { error } = await supabase.from("campaign_notes").insert(rows);
  if (error) throw new Error(error.message);
  summary.notes = rows.length;
}

async function importAssets(
  manifest: CampaignPackageManifest,
  archive: Archive,
  campaignId: string,
  userId: string,
  summary: CampaignImportSummary,
  step: (label: string) => void,
) {
  if (!manifest.assets.length) return;
  step("Importing assets…");
  for (const asset of manifest.assets) {
    const source = fileFromZip(archive, asset.file);
    const invalid = validateAssetFile(source);
    if (invalid) throw new Error(`${asset.file}: ${invalid}`);
    const uploaded = await uploadAssetFile(campaignId, source);
    await createAsset({
      campaign_id: campaignId,
      title: asset.title,
      caption: asset.caption ?? null,
      tags: asset.tags,
      visible_to_players: asset.visible_to_players,
      storage_path: uploaded.path,
      mime_type: uploaded.mimeType,
      byte_size: uploaded.byteSize,
      created_by: userId,
    });
    summary.assets += 1;
  }
}

async function importMaps(
  manifest: CampaignPackageManifest,
  archive: Archive,
  campaignId: string,
  userId: string,
  summary: CampaignImportSummary,
  step: (label: string) => void,
  ids: ImportIds,
) {
  if (!manifest.maps.length) return;
  step("Importing battle maps…");
  for (const map of manifest.maps) {
    const imagePath = map.file ? await uploadMapImage(campaignId, fileFromZip(archive, map.file)) : null;
    const created = await createMap({
      campaign_id: campaignId,
      name: map.name,
      image_path: imagePath,
      grid_type: map.grid_type,
      grid_size: map.grid_size,
      grid_offset_x: map.grid_offset_x,
      grid_offset_y: map.grid_offset_y,
      unit_per_cell: map.unit_per_cell,
      unit_name: map.unit_name,
      is_active: map.is_active,
      visible_to_players: map.visible_to_players,
      created_by: userId,
    });
    summary.maps += 1;

    for (const object of map.objects) {
      const tokenImage = object.image_file
        ? await uploadLoreImage(archive, object.image_file, campaignId, userId)
        : null;
      const data: Record<string, unknown> = { ...object.data };
      if (object.entity_key) data["entity_id"] = ids.entities.get(object.entity_key) ?? null;
      await createMapObject({
        campaign_id: campaignId,
        map_id: created.id,
        kind: object.kind,
        label: object.label,
        x: object.x,
        y: object.y,
        size: object.size,
        rotation: object.rotation,
        color: object.color ?? null,
        hidden: object.hidden,
        image_url: tokenImage,
        character_id: object.character_key ? (ids.characters.get(object.character_key) ?? null) : null,
        data: data as NonNullable<TablesInsert<"map_objects">["data"]>,
        created_by: userId,
      });
      summary.mapObjects += 1;
    }
  }
}

async function importSoundtracks(
  manifest: CampaignPackageManifest,
  archive: Archive,
  campaignId: string,
  summary: CampaignImportSummary,
  step: (label: string) => void,
) {
  if (!manifest.soundtracks.length) return;
  step("Importing soundtracks…");
  for (const album of manifest.soundtracks) {
    const cover = await bytesAsAvif(archive, album.cover);
    const tracks = album.tracks.map((track) => {
      const mime = soundtrackAudioMime(track.file);
      if (!mime) throw new Error(`Unsupported audio format: ${track.file}`);
      const bytes = archive[track.file] ?? archive[track.file.replace(/^\.\//, "")]!;
      return {
        position: track.position,
        name: track.file.split("/").pop() ?? `track-${track.position}`,
        bytes,
        mime,
      };
    });
    await importCampaignSoundtrack(
      campaignId,
      {
        packVersion: 1,
        album: {
          slug: album.slug,
          title: album.title,
          subtitle: album.subtitle ?? null,
          description: album.description ?? null,
          composer: album.composer ?? null,
          release_year: album.release_year ?? null,
          cover: album.cover,
        },
        tracks: album.tracks.map((track) => ({
          position: track.position,
          title: track.title,
          composer: track.composer ?? null,
          duration_seconds: track.duration_seconds ?? null,
          file: track.file,
        })),
      },
      { name: album.cover, bytes: cover },
      tracks,
    );
    summary.albums += 1;
    summary.tracks += album.tracks.length;
  }
}
