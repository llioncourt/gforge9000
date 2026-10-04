/**
 * Reads a soundtrack package (.zip) and imports it into a campaign. Shared by
 * the soundtrack panel and by approved player submissions.
 */
import { unzipSync } from "fflate";
import {
  campaignSoundtrackManifestSchema,
  MAX_SOUNDTRACK_COVER_BYTES,
  MAX_SOUNDTRACK_TRACK_BYTES,
  soundtrackAudioMime,
} from "@/lib/campaign-soundtrack-pack";
import { importCampaignSoundtrack } from "@/lib/campaign-soundtrack";
import { convertToAvif, isImageFile } from "@/lib/image-avif";

/** Minimal translate signature used for the error messages. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

async function coverToAvifBytes(path: string, bytes: Uint8Array, t: Translate) {
  if (/\.avif$/i.test(path)) return bytes;
  const name = path.split("/").pop() ?? "cover.png";
  const file = new File([bytes.slice().buffer as ArrayBuffer], name);
  if (!isImageFile(file)) throw new Error(t("soundtrack.errors.coverMustBeImage", { path }));
  const converted = await convertToAvif(file);
  return new Uint8Array(await converted.arrayBuffer());
}

export async function importSoundtrackArchive(campaignId: string, file: File, t: Translate) {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer())),
    pick = (p: string) => archive[p] ?? archive[p.replace(/^\.\//, "")],
    raw = archive["album.json"];
  if (!raw) throw new Error(t("soundtrack.errors.missingAlbumJson"));
  const manifest = campaignSoundtrackManifestSchema.parse(
      JSON.parse(new TextDecoder().decode(raw)),
    ),
    positions = manifest.tracks.map((tr) => tr.position).sort((a, b) => a - b);
  if (positions.some((p, i) => p !== i + 1)) throw new Error(t("soundtrack.errors.trackPositions"));
  const coverEntry = pick(manifest.album.cover);
  if (!coverEntry)
    throw new Error(t("soundtrack.errors.missingCover", { path: manifest.album.cover }));
  if (coverEntry.length > MAX_SOUNDTRACK_COVER_BYTES)
    throw new Error(t("soundtrack.errors.coverTooLarge"));
  const cover = await coverToAvifBytes(manifest.album.cover, coverEntry, t as Translate);
  const tracks = manifest.tracks.map((meta) => {
    const bytes = pick(meta.file);
    if (!bytes) throw new Error(t("soundtrack.errors.missingTrack", { file: meta.file }));
    const mime = soundtrackAudioMime(meta.file);
    if (!mime) throw new Error(t("soundtrack.errors.unsupportedFormat", { file: meta.file }));
    if (bytes.length > MAX_SOUNDTRACK_TRACK_BYTES)
      throw new Error(t("soundtrack.errors.trackTooLarge", { file: meta.file }));
    return {
      position: meta.position,
      name: meta.file.split("/").pop() ?? `track-${meta.position}`,
      bytes,
      mime,
    };
  });
  await importCampaignSoundtrack(
    campaignId,
    manifest,
    { name: manifest.album.cover, bytes: cover },
    tracks,
  );
}
