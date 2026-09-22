/**
 * Server-safe core of the campaign package importer.
 *
 * `src/lib/campaign-package-import.ts` (the browser importer) reaches many of
 * its writes through helpers (`@/lib/assets`, `battlemap`, `campaign-intro`,
 * `campaign-sound-fx`, `campaign-soundtrack`, `lore`, `portrait`) that import
 * the browser Supabase singleton, and it converts every image to AVIF with
 * `@/lib/image-avif`, which needs a browser canvas/WASM encoder. Neither can
 * be imported from the Worker-safe MCP surface, so this core writes the same
 * tables/buckets directly against an injected client.
 *
 * What IS shared, not duplicated: the manifest schema and cross-reference
 * validation (`@/lib/campaign-package`), import identity/idempotency
 * (`@/lib/import-identity`), the portable-character parser
 * (`@/lib/portable`), and visibility normalisation (`@/lib/visibility`).
 *
 * Known difference from the browser importer: images (entity/token images,
 * character portraits, soundtrack covers) are stored as the original bytes
 * with their original content type instead of being converted to AVIF, since
 * AVIF encoding needs a browser canvas. Storage paths, buckets, table rows,
 * and import_key idempotency are otherwise identical.
 */
import { unzipSync } from "fflate";
import type { Client } from "@/lib/mcp/kit.server";
import {
  MAX_CAMPAIGN_PACKAGE_BYTES,
  parseCampaignPackageManifest,
  referencedFiles,
  validateCampaignPackage,
  type CampaignImportSummary,
  type CampaignPackageManifest,
} from "@/lib/campaign-package";
import { campaignPackageImportKey, packageChildImportKey } from "@/lib/import-identity";
import { normalizeVisibility } from "@/lib/visibility";
import { parsePortable } from "@/lib/portable";
import { allowedPacksOf } from "@/lib/packs";
import { reconcileEntriesWithClient } from "@/lib/trait-reconcile-core";
import type { ImportedEntry } from "@/lib/trait-match";
import { soundtrackAudioMime } from "@/lib/campaign-soundtrack-pack";

// Source of truth for bucket names: the browser lib modules named above.
const ASSET_BUCKET = "lore-assets";
const MAP_BUCKET = "maps";
const CAMPAIGN_INTRO_BUCKET = "campaign-intros";
const CAMPAIGN_SOUND_FX_BUCKET = "campaign-sound-fx";
const CAMPAIGN_SOUNDTRACK_BUCKET = "campaign-soundtracks";
const PORTRAIT_BUCKET = "portraits";

type Archive = Record<string, Uint8Array>;

function bytesFromZip(archive: Archive, path: string): Uint8Array {
  const bytes = archive[path] ?? archive[path.replace(/^\.\//, "")];
  if (!bytes) throw new Error(`The package is missing "${path}".`);
  return bytes;
}

function extOf(path: string, fallback: string): string {
  const ext = path.split("/").pop()?.split(".").pop();
  return ext && ext.length <= 5 ? ext.toLowerCase() : fallback;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
};

function mimeFromPath(path: string, fallback = "application/octet-stream"): string {
  const ext = extOf(path, "");
  return MIME_BY_EXT[ext] ?? fallback;
}

/**
 * Detects image formats from their magic bytes rather than trusting the
 * archive path's extension. This matters because the browser wrapper
 * pre-converts every image entry to AVIF (matching the app's long-standing
 * browser AVIF behaviour) while keeping the original file name, so the
 * bytes and the path extension can legitimately disagree.
 */
function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 12) {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)
    return "image/gif";
  return null;
}

async function uploadFromZip(
  supabase: Client,
  archive: Archive,
  path: string,
  bucket: string,
  destPath: string,
  fallbackMime = "application/octet-stream",
): Promise<void> {
  const bytes = bytesFromZip(archive, path);
  const mime = sniffImageMime(bytes) ?? mimeFromPath(path, fallbackMime);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(destPath, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
}

export type CampaignImportCoreResult = CampaignImportSummary;

/**
 * Validates then imports a campaign package ZIP against an injected,
 * RLS-scoped Supabase client. Mirrors the browser importer's identity and
 * rollback semantics (see the module comment for the one real difference:
 * image conversion).
 */
export async function importCampaignPackageCore(
  supabase: Client,
  userId: string,
  zipBytes: Uint8Array,
  onProgress?: (step: string) => void,
): Promise<CampaignImportCoreResult> {
  if (zipBytes.byteLength > MAX_CAMPAIGN_PACKAGE_BYTES) {
    throw new Error(
      `The package is larger than ${Math.round(MAX_CAMPAIGN_PACKAGE_BYTES / 1024 / 1024)} MB.`,
    );
  }
  const step = (label: string) => onProgress?.(label);
  step("Reading package…");
  const archive = unzipSync(zipBytes) as Archive;
  const manifestBytes = archive["campaign.json"];
  if (!manifestBytes) throw new Error("The package must contain campaign.json at its root.");
  const manifest = parseCampaignPackageManifest(new TextDecoder().decode(manifestBytes));

  const problems = validateCampaignPackage(manifest);
  if (problems.length) throw new Error(problems[0]!);
  const missing = referencedFiles(manifest).filter(
    (path) => !archive[path] && !archive[path.replace(/^\.\//, "")],
  );
  if (missing.length) throw new Error(`The package is missing "${missing[0]}".`);

  const packageKey = campaignPackageImportKey(manifest);
  const { data: previous } = await supabase
    .from("campaigns")
    .select("id")
    .eq("gm_id", userId)
    .eq("import_key", packageKey)
    .maybeSingle();

  const settings = {
    point_limit: manifest.campaign.settings?.point_limit ?? 150,
    disadvantage_limit: manifest.campaign.settings?.disadvantage_limit ?? -50,
    tech_level: manifest.campaign.settings?.tech_level ?? 8,
    house_rules: manifest.campaign.settings?.house_rules ?? "",
    allowed_sources: manifest.campaign.settings?.allowed_sources ?? ["user"],
    ...(manifest.campaign.settings?.allowed_packs
      ? { allowed_packs: manifest.campaign.settings.allowed_packs }
      : {}),
  };

  let campaignId: string;
  if (previous) {
    step("Updating campaign…");
    const { error } = await supabase
      .from("campaigns")
      .update({
        name: manifest.campaign.name,
        description: manifest.campaign.description ?? null,
        settings,
      })
      .eq("id", previous.id);
    if (error) throw new Error(error.message);
    campaignId = previous.id;
  } else {
    step("Creating campaign…");
    const { data: created, error } = await supabase
      .from("campaigns")
      .insert({
        name: manifest.campaign.name,
        description: manifest.campaign.description ?? null,
        import_key: packageKey,
        gm_id: userId,
        settings,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    campaignId = created.id;
  }

  const summary: CampaignImportSummary = {
    campaignId,
    notes: 0,
    entities: 0,
    relationships: 0,
    assets: 0,
    maps: 0,
    mapObjects: 0,
    albums: 0,
    tracks: 0,
    videos: 0,
    soundFx: 0,
    characters: 0,
    intro: false,
  };
  const firstImport = !previous;
  const characterIds = new Map<string, string>();
  const entityIds = new Map<string, string>();

  try {
    // --- characters ---------------------------------------------------------
    if (manifest.characters.length) {
      step("Importing characters…");
      for (const entry of manifest.characters) {
        const portable = parsePortable(new TextDecoder().decode(bytesFromZip(archive, entry.file)));
        const record = portable.character;
        const importKey = packageChildImportKey(packageKey, "character", entry.key);
        const insert = {
          owner_id: userId,
          campaign_id: campaignId,
          import_key: importKey,
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
        const { data: existing } = await supabase
          .from("characters")
          .select("id")
          .eq("owner_id", userId)
          .eq("import_key", importKey)
          .maybeSingle();
        let characterId: string;
        if (existing) {
          const { error } = await supabase
            .from("characters")
            .update(insert as never)
            .eq("id", existing.id);
          if (error) throw new Error(error.message);
          characterId = existing.id;
          const cleared = await supabase
            .from("character_entries")
            .delete()
            .eq("character_id", characterId);
          if (cleared.error) throw new Error(cleared.error.message);
        } else {
          const { data: createdRow, error } = await supabase
            .from("characters")
            .insert(insert as never)
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          characterId = createdRow.id;
        }
        characterIds.set(entry.key, characterId);

        if (portable.entries.length) {
          // Same canonicalisation the browser importer performs (minus its
          // best-effort AI pass for translated names, which needs a browser
          // session): entries are matched against the library the caller can
          // actually use, and their provenance — including any content-pack
          // link — is written through untouched.
          const reconciled = await reconcileEntriesWithClient(
            supabase,
            portable.entries as unknown as ImportedEntry[],
            allowedPacksOf(settings),
          );
          const rows = reconciled.entries.map((item, index) => ({
            character_id: characterId,
            kind: item.kind,
            name: item.name,
            category: item.category ?? null,
            points: item.points,
            levels: item.levels,
            data: (item.data ?? {}) as never,
            notes: item.notes ?? null,
            source: (item.source ?? {}) as never,
            sort_order: (item as { sort_order?: number }).sort_order ?? index,
          }));
          const entriesResult = await supabase.from("character_entries").insert(rows as never);
          if (entriesResult.error) throw new Error(entriesResult.error.message);
        }

        if (entry.portrait_file && !existing) {
          const path = `${userId}/${characterId}/${crypto.randomUUID()}.${extOf(entry.portrait_file, "png")}`;
          await uploadFromZip(
            supabase,
            archive,
            entry.portrait_file,
            PORTRAIT_BUCKET,
            path,
            "image/png",
          );
          const update = await supabase
            .from("characters")
            .update({ portrait_path: path })
            .eq("id", characterId);
          if (update.error) throw new Error(update.error.message);
        }
        summary.characters += 1;
      }
    }

    // --- lore -----------------------------------------------------------------
    if (manifest.lore.entities.length) {
      step("Importing lore…");
      const existingByKey = new Map<string, { id: string; image_url: string | null }>();
      if (!firstImport) {
        const keys = manifest.lore.entities.map((e) =>
          packageChildImportKey(packageKey, "entity", e.key),
        );
        const { data: rows } = await supabase
          .from("entities")
          .select("id, import_key, image_url")
          .eq("campaign_id", campaignId)
          .in("import_key", keys);
        for (const row of rows ?? []) {
          if (row.import_key)
            existingByKey.set(row.import_key, { id: row.id, image_url: row.image_url });
        }
      }
      for (const entity of manifest.lore.entities) {
        const importKey = packageChildImportKey(packageKey, "entity", entity.key);
        const previousEntity = existingByKey.get(importKey);
        let imagePath: string | null = previousEntity?.image_url ?? null;
        if (entity.image_file && !imagePath) {
          imagePath = `${userId}/${campaignId}/${crypto.randomUUID()}.${extOf(entity.image_file, "png")}`;
          await uploadFromZip(
            supabase,
            archive,
            entity.image_file,
            ASSET_BUCKET,
            imagePath,
            "image/png",
          );
        }
        const data: Record<string, unknown> = { ...entity.data };
        if (entity.character_key)
          data["character_sheet_id"] = characterIds.get(entity.character_key) ?? null;
        const payload = {
          campaign_id: campaignId,
          import_key: importKey,
          kind: entity.kind,
          name: entity.name,
          status: entity.status,
          visibility: normalizeVisibility(entity.visibility),
          summary: entity.summary ?? null,
          description: entity.description ?? null,
          player_description: entity.player_description ?? null,
          gm_notes: entity.gm_notes ?? null,
          aliases: entity.aliases,
          tags: entity.tags,
          sort_order: entity.sort_order,
          image_url: imagePath,
          character_id: entity.character_key
            ? (characterIds.get(entity.character_key) ?? null)
            : null,
          data: data as never,
        };
        if (previousEntity) {
          const { error } = await supabase
            .from("entities")
            .update(payload as never)
            .eq("id", previousEntity.id);
          if (error) throw new Error(error.message);
          entityIds.set(entity.key, previousEntity.id);
        } else {
          const { data: createdEntity, error } = await supabase
            .from("entities")
            .insert(payload as never)
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          entityIds.set(entity.key, createdEntity.id);
        }
        summary.entities += 1;
      }
      for (const entity of manifest.lore.entities) {
        if (!entity.parent_key) continue;
        const id = entityIds.get(entity.key);
        const parentId = entityIds.get(entity.parent_key);
        if (id && parentId) {
          const { error } = await supabase
            .from("entities")
            .update({ parent_id: parentId })
            .eq("id", id);
          if (error) throw new Error(error.message);
        }
      }
      for (const rel of manifest.lore.relationships) {
        const sourceId = entityIds.get(rel.source_key);
        const targetId = entityIds.get(rel.target_key);
        if (!sourceId || !targetId) continue;
        const { error } = await supabase.from("entity_relationships").upsert(
          [
            {
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
              visibility: normalizeVisibility(rel.visibility),
            },
          ] as never,
          { onConflict: "campaign_id,source_id,target_id,rel_type", ignoreDuplicates: true },
        );
        if (error) throw new Error(error.message);
        summary.relationships += 1;
      }
    }

    if (firstImport) {
      if (manifest.notes.length) {
        step("Importing notes…");
        const rows = manifest.notes.map((note) => ({
          campaign_id: campaignId,
          author_id: userId,
          kind: note.kind,
          title: note.title,
          body: note.body,
          gm_only: note.gm_only,
        }));
        const { error } = await supabase.from("campaign_notes").insert(rows as never);
        if (error) throw new Error(error.message);
        summary.notes = rows.length;
      }

      if (manifest.assets.length) {
        step("Importing assets…");
        for (const asset of manifest.assets) {
          const bytes = bytesFromZip(archive, asset.file);
          const path = `${userId}/${campaignId}/${crypto.randomUUID()}.${extOf(asset.file, "bin")}`;
          const mime = mimeFromPath(asset.file);
          await uploadFromZip(supabase, archive, asset.file, ASSET_BUCKET, path, mime);
          const { error } = await supabase.from("campaign_assets").insert({
            campaign_id: campaignId,
            title: asset.title,
            caption: asset.caption ?? null,
            tags: asset.tags,
            visible_to_players: asset.visible_to_players,
            storage_path: path,
            mime_type: mime,
            byte_size: bytes.byteLength,
            created_by: userId,
          } as never);
          if (error) throw new Error(error.message);
          summary.assets += 1;
        }
      }

      if (manifest.maps.length) {
        step("Importing battle maps…");
        for (const map of manifest.maps) {
          let imagePath: string | null = null;
          if (map.file) {
            imagePath = `${userId}/${campaignId}/${crypto.randomUUID()}.${extOf(map.file, "webp")}`;
            await uploadFromZip(supabase, archive, map.file, MAP_BUCKET, imagePath, "image/webp");
          }
          const { data: createdMap, error } = await supabase
            .from("maps")
            .insert({
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
            } as never)
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          summary.maps += 1;
          for (const object of map.objects) {
            let tokenImage: string | null = null;
            if (object.image_file) {
              tokenImage = `${userId}/${campaignId}/${crypto.randomUUID()}.${extOf(object.image_file, "png")}`;
              await uploadFromZip(
                supabase,
                archive,
                object.image_file,
                ASSET_BUCKET,
                tokenImage,
                "image/png",
              );
            }
            const data: Record<string, unknown> = { ...object.data };
            if (object.entity_key) data["entity_id"] = entityIds.get(object.entity_key) ?? null;
            const { error: objError } = await supabase.from("map_objects").insert({
              campaign_id: campaignId,
              map_id: createdMap.id,
              kind: object.kind,
              label: object.label,
              x: object.x,
              y: object.y,
              size: object.size,
              rotation: object.rotation,
              color: object.color ?? null,
              hidden: object.hidden,
              image_url: tokenImage,
              character_id: object.character_key
                ? (characterIds.get(object.character_key) ?? null)
                : null,
              data: data as never,
              created_by: userId,
            } as never);
            if (objError) throw new Error(objError.message);
            summary.mapObjects += 1;
          }
        }
      }

      if (manifest.videos.length) {
        step("Importing videos…");
        for (const video of manifest.videos) {
          const path = `${userId}/${campaignId}/${crypto.randomUUID()}.mp4`;
          await uploadFromZip(
            supabase,
            archive,
            video.file,
            CAMPAIGN_INTRO_BUCKET,
            path,
            "video/mp4",
          );
          const { error } = await supabase.from("campaign_videos").insert({
            campaign_id: campaignId,
            storage_path: path,
            thumb_path: null,
            file_name: video.file.split("/").pop() ?? "video.mp4",
            title: video.title,
            video_type: video.type,
            byte_size: bytesFromZip(archive, video.file).byteLength,
            mime_type: "video/mp4",
            version: crypto.randomUUID(),
            created_by: userId,
          } as never);
          if (error) throw new Error(error.message);
          summary.videos += 1;
          if (video.type === "intro") summary.intro = true;
        }
      }

      if (manifest.soundtracks.length) {
        step("Importing soundtracks…");
        for (const album of manifest.soundtracks) {
          const albumId = crypto.randomUUID();
          const root = `${userId}/${campaignId}/${albumId}`;
          const coverPath = `${root}/cover.${extOf(album.cover, "jpg")}`;
          await uploadFromZip(
            supabase,
            archive,
            album.cover,
            CAMPAIGN_SOUNDTRACK_BUCKET,
            coverPath,
            "image/jpeg",
          );
          const { error: albumError } = await supabase.from("campaign_soundtrack_albums").insert({
            id: albumId,
            campaign_id: campaignId,
            slug: album.slug,
            title: album.title,
            subtitle: album.subtitle ?? null,
            description: album.description ?? null,
            composer: album.composer ?? null,
            release_year: album.release_year ?? null,
            game_slug: album.game_slug ?? null,
            status: album.status ?? "published",
            cover_path: coverPath,
          } as never);
          if (albumError) throw new Error(albumError.message);
          for (const track of album.tracks) {
            const mime = soundtrackAudioMime(track.file);
            if (!mime) throw new Error(`Unsupported audio format: ${track.file}`);
            const safeName = (track.file.split("/").pop() ?? `track-${track.position}`).replace(
              /[^a-zA-Z0-9._-]/g,
              "_",
            );
            const trackPath = `${root}/tracks/${String(track.position).padStart(2, "0")}-${safeName}`;
            await uploadFromZip(
              supabase,
              archive,
              track.file,
              CAMPAIGN_SOUNDTRACK_BUCKET,
              trackPath,
              mime,
            );
            const { error: trackError } = await supabase.from("campaign_soundtrack_tracks").insert({
              campaign_id: campaignId,
              album_id: albumId,
              position: track.position,
              title: track.title,
              composer: track.composer ?? album.composer ?? null,
              duration_seconds: track.duration_seconds ?? null,
              lyrics: track.lyrics ?? null,
              storage_path: trackPath,
              file_name: safeName,
              byte_size: bytesFromZip(archive, track.file).byteLength,
              mime_type: mime,
            } as never);
            if (trackError) throw new Error(trackError.message);
            summary.tracks += 1;
          }
          summary.albums += 1;
        }
      }

      if (manifest.sound_fx.length) {
        step("Importing sound effects…");
        let sortOrder = 0;
        for (const effect of manifest.sound_fx) {
          const path = `${userId}/${campaignId}/${crypto.randomUUID()}.${extOf(effect.file, "mp3")}`;
          const mime = mimeFromPath(effect.file, "audio/mpeg");
          await uploadFromZip(supabase, archive, effect.file, CAMPAIGN_SOUND_FX_BUCKET, path, mime);
          const { error } = await supabase.from("campaign_sound_fx").insert({
            campaign_id: campaignId,
            title: effect.title,
            storage_path: path,
            file_name: effect.file.split("/").pop() ?? "effect",
            byte_size: bytesFromZip(archive, effect.file).byteLength,
            mime_type: mime,
            created_by: userId,
            sort_order: sortOrder++,
          } as never);
          if (error) throw new Error(error.message);
          summary.soundFx += 1;
        }
      }

      if (manifest.intro) {
        step("Uploading intro video…");
        const path = `${userId}/${campaignId}/${crypto.randomUUID()}.mp4`;
        await uploadFromZip(
          supabase,
          archive,
          manifest.intro.file,
          CAMPAIGN_INTRO_BUCKET,
          path,
          "video/mp4",
        );
        const { error } = await supabase.from("campaign_videos").insert({
          campaign_id: campaignId,
          storage_path: path,
          thumb_path: null,
          file_name: manifest.intro.file.split("/").pop() ?? "intro.mp4",
          title: "Campaign intro",
          video_type: "intro",
          byte_size: bytesFromZip(archive, manifest.intro.file).byteLength,
          mime_type: "video/mp4",
          version: crypto.randomUUID(),
          created_by: userId,
        } as never);
        if (error) throw new Error(error.message);
        summary.intro = true;
        summary.videos += 1;
      }
    }
  } catch (error) {
    if (firstImport) await supabase.from("campaigns").delete().eq("id", campaignId);
    throw error;
  }

  return summary;
}
