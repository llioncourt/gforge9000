import { z } from "zod";

export const MAX_SOUNDTRACK_COVER_BYTES = 3 * 1024 * 1024;
export const MAX_SOUNDTRACK_TRACK_BYTES = 40 * 1024 * 1024;
export const MAX_SOUNDTRACK_TRACKS = 60;

export const SOUNDTRACK_AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  m4a: "audio/mp4",
};

const slug = z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/);

export const campaignSoundtrackManifestSchema = z.object({
  packVersion: z.literal(1),
  album: z.object({
    slug,
    title: z.string().trim().min(2).max(160),
    subtitle: z.string().trim().max(200).optional().nullable(),
    description: z.string().trim().max(4000).optional().nullable(),
    composer: z.string().trim().max(160).optional().nullable(),
    release_year: z.number().int().min(1970).max(2100).optional().nullable(),
    game_slug: slug.optional().nullable(),
    status: z.enum(["draft", "published"]).optional(),
    cover: z.string().trim().min(1).max(200),
  }),
  tracks: z.array(z.object({
    position: z.number().int().min(1).max(MAX_SOUNDTRACK_TRACKS),
    title: z.string().trim().min(1).max(200),
    composer: z.string().trim().max(160).optional().nullable(),
    duration_seconds: z.number().int().min(1).max(3600).optional().nullable(),
    file: z.string().trim().min(1).max(200),
    lyrics: z.string().trim().max(200).optional().nullable(),
  })).min(1).max(MAX_SOUNDTRACK_TRACKS),
}).strict();

export type CampaignSoundtrackManifest = z.infer<typeof campaignSoundtrackManifestSchema>;

export function soundtrackAudioMime(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return SOUNDTRACK_AUDIO_MIME[extension] ?? null;
}

export function formatSoundtrackTime(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
