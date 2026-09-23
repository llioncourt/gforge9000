/**
 * Campaign audio: soundtrack albums/tracks and one-shot sound effects.
 *
 * Reads rely on the caller's RLS-scoped client: `campaign_soundtrack_albums`,
 * `campaign_soundtrack_tracks` (which inherit their album's visibility) and
 * `campaign_sound_fx` already only return player-visible rows to a non-GM
 * caller, so list/get actions do not re-filter — they still require campaign
 * membership up front as defense in depth. Every write is GM-only on top of
 * RLS, via `loadCampaign` + `requireGmFor`.
 */

import { z } from "zod/v4";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  DESTROY,
  MODIFY,
  READ,
  actionRouter,
  deleteReply,
  detailReply,
  domainOutput,
  fail,
  intField,
  isCampaignMember,
  limitField,
  listReply,
  loadCampaign,
  requireGmFor,
  uuid,
  dbPayload,
  anyDb,
} from "@/lib/mcp/kit.server";
import { derivePlaybackPosition } from "@/lib/playback-anchor";
import type { McpToolContext, Structured, ToolRegistrar } from "@/lib/mcp/kit.server";
import {
  decodeBase64File,
  fetchRemoteFile,
  prepareSignedUpload,
  removeStoredObject,
  signedReadUrl,
  storagePathFor,
  uploadBytes,
  verifyStoredObject,
} from "@/lib/mcp/uploads.server";

/*
 * `campaign_soundtrack_albums`, `campaign_sound_fx` and `campaign_videos` just
 * gained a `visible_to_players` column and tightened SELECT policies. The
 * generated types already reflect the new column here, so plain typed access
 * works — `anyDb` is only used below for the handful of fields/tables the
 * generated types genuinely do not model well (kept minimal per the kit note).
 */

/* ------------------------------------------------------------------ */
/* Constants copied from src/lib/campaign-soundtrack.ts and
 * src/lib/campaign-sound-fx.ts (both import the browser Supabase client, so
 * per the domain contract we copy the plain constants/logic instead of
 * importing those modules). */
/* ------------------------------------------------------------------ */

const CAMPAIGN_SOUNDTRACK_BUCKET = "campaign-soundtracks";
const CAMPAIGN_SOUND_FX_BUCKET = "campaign-sound-fx";
const CAMPAIGN_SOUND_FX_MAX_BYTES = 40 * 1024 * 1024;

const SOUND_FX_MIME_TYPES = [
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
] as const;

// campaign-soundtrack.ts has no dedicated per-track size ceiling; reusing the
// sound-effect ceiling as a reasonable bound for MCP-driven uploads.
const CAMPAIGN_SOUNDTRACK_TRACK_MAX_BYTES = CAMPAIGN_SOUND_FX_MAX_BYTES;
const SOUNDTRACK_TRACK_MIME_TYPES = SOUND_FX_MIME_TYPES;

// The app's own importer hardcodes album covers to image/avif and never
// validates a general upload; these are introduced here as a reasonable
// allow-list/ceiling for MCP-driven cover uploads.
const CAMPAIGN_COVER_MAX_BYTES = 5 * 1024 * 1024;
const CAMPAIGN_COVER_MIME_TYPES = ["image/avif", "image/webp", "image/jpeg", "image/png"] as const;

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const albumFields = {
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  subtitle: z.string().max(200).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  composer: z.string().max(200).nullable().optional(),
  release_year: intField(0, 3000, "release_year").nullable().optional(),
  game_slug: z.string().max(200).nullable().optional(),
  status: z.enum(["draft", "published"]).optional(),
};

const trackFields = {
  title: z.string().min(1).max(200),
  position: intField(0, 9999, "position"),
  composer: z.string().max(200).nullable().optional(),
  duration_seconds: intField(0, 60 * 60 * 12, "duration_seconds")
    .nullable()
    .optional(),
  lyrics: z.string().max(20000).nullable().optional(),
};

/** Positions are fractional seconds, unlike the whole-second metadata fields. */
const secondsField = z
  .number()
  .min(0, "position_seconds must be a number between 0 and 43200")
  .max(60 * 60 * 12, "position_seconds must be a number between 0 and 43200");

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("list"), campaign_id: uuid, limit: limitField })
    .describe("List a campaign's soundtrack albums, each with its tracks."),
  z
    .object({
      action: z.literal("create_album"),
      campaign_id: uuid,
      cover_storage_path: z.string().min(1).max(400),
      visible_to_players: z.boolean().optional(),
      ...albumFields,
    })
    .describe(
      "Create a soundtrack album from a cover already uploaded via prepare_cover_upload " +
        "(or upload_cover_from_url / upload_cover_base64). GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("update_album"),
      album_id: uuid,
      cover_storage_path: z.string().min(1).max(400).optional(),
      title: albumFields.title.optional(),
      slug: albumFields.slug.optional(),
      subtitle: albumFields.subtitle,
      description: albumFields.description,
      composer: albumFields.composer,
      release_year: albumFields.release_year,
      game_slug: albumFields.game_slug,
      status: albumFields.status,
    })
    .describe(
      "Update a soundtrack album's fields, optionally replacing its cover. GM only, changes data.",
    ),
  z
    .object({ action: z.literal("delete_album"), album_id: uuid })
    .describe(
      "Delete a soundtrack album, its tracks, and their stored files. GM only, deletes data.",
    ),
  z
    .object({
      action: z.literal("set_album_visibility"),
      album_id: uuid,
      visible_to_players: z.boolean(),
    })
    .describe(
      "Show or hide a soundtrack album (and its tracks) from players. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("add_track"),
      album_id: uuid,
      storage_path: z.string().min(1).max(400),
      file_name: z.string().min(1).max(300),
      byte_size: intField(1, CAMPAIGN_SOUNDTRACK_TRACK_MAX_BYTES, "byte_size"),
      mime_type: z.string().min(1).max(100),
      ...trackFields,
    })
    .describe(
      "Add a track to an album from audio already uploaded via prepare_track_upload. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("update_track"),
      track_id: uuid,
      title: trackFields.title.optional(),
      position: trackFields.position.optional(),
      composer: trackFields.composer,
      duration_seconds: trackFields.duration_seconds,
      lyrics: trackFields.lyrics,
    })
    .describe("Update a track's metadata. GM only, changes data."),
  z
    .object({ action: z.literal("delete_track"), track_id: uuid })
    .describe("Delete a track and its stored audio file. GM only, deletes data."),
  z
    .object({ action: z.literal("get_track_url"), track_id: uuid })
    .describe("Get a short-lived signed URL to play a track."),
  z
    .object({
      action: z.literal("set_playback"),
      campaign_id: uuid,
      album_id: uuid.nullable().optional(),
      track_id: uuid.nullable().optional(),
      is_playing: z.boolean(),
      position_seconds: intField(0, 60 * 60 * 12, "position_seconds"),
      loop_one: z.boolean(),
    })
    .describe(
      "Legacy: set the campaign's shared soundtrack playback state in one call. Still supported, " +
        "and it now also writes the anchor (anchor_position_seconds/anchored_at) used to derive " +
        "the live position. Prefer play/pause/resume/seek/stop/set_loop. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("play"),
      campaign_id: uuid,
      track_id: uuid,
      position_seconds: secondsField.optional(),
      loop_one: z.boolean().optional(),
    })
    .describe("Start a track from position_seconds (default 0). GM only, changes data."),
  z
    .object({ action: z.literal("pause"), campaign_id: uuid })
    .describe(
      "Pause where the track is right now: the derived position is frozen into the anchor. GM only, changes data.",
    ),
  z
    .object({ action: z.literal("resume"), campaign_id: uuid })
    .describe("Resume from the exact paused point. GM only, changes data."),
  z
    .object({
      action: z.literal("seek"),
      campaign_id: uuid,
      position_seconds: secondsField,
    })
    .describe("Jump to a position, keeping playing/paused as it is. GM only, changes data."),
  z
    .object({ action: z.literal("stop"), campaign_id: uuid })
    .describe("Stop playback and reset the position to zero. GM only, changes data."),
  z
    .object({ action: z.literal("set_loop"), campaign_id: uuid, loop_one: z.boolean() })
    .describe("Turn repeat-one on or off without disturbing playback. GM only, changes data."),
  z
    .object({ action: z.literal("get_playback"), campaign_id: uuid })
    .describe(
      "Read the shared soundtrack playback state with position_seconds already derived from the " +
        "anchor, plus the track's duration_seconds. Read-only.",
    ),
  z
    .object({
      action: z.literal("prepare_cover_upload"),
      campaign_id: uuid,
      file_name: z.string().min(1).max(300),
      mime_type: z.string().min(1).max(100),
      byte_size: intField(1, CAMPAIGN_COVER_MAX_BYTES, "byte_size"),
    })
    .describe(
      "Get a short-lived signed target to upload an album cover image to. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("upload_cover_from_url"),
      campaign_id: uuid,
      url: z.string().url(),
    })
    .describe(
      "Disabled for security reasons: use prepare_cover_upload + create_album/update_album, or upload_cover_base64.",
    ),
  z
    .object({
      action: z.literal("upload_cover_base64"),
      campaign_id: uuid,
      file_name: z.string().min(1).max(300),
      mime_type: z.string().min(1).max(100),
      data: z.string().min(1),
    })
    .describe(
      "Upload a small (<=8MB) base64-encoded cover image, returning its storage path for " +
        "create_album/update_album. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("prepare_track_upload"),
      album_id: uuid,
      file_name: z.string().min(1).max(300),
      mime_type: z.string().min(1).max(100),
      byte_size: intField(1, CAMPAIGN_SOUNDTRACK_TRACK_MAX_BYTES, "byte_size"),
    })
    .describe(
      "Get a short-lived signed target to upload a track's audio file to. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("upload_track_from_url"),
      album_id: uuid,
      url: z.string().url(),
      file_name: z.string().min(1).max(300).optional(),
      ...trackFields,
    })
    .describe(
      "Disabled for security reasons: use prepare_track_upload + add_track, or upload_track_base64.",
    ),
  z
    .object({
      action: z.literal("upload_track_base64"),
      album_id: uuid,
      file_name: z.string().min(1).max(300),
      mime_type: z.string().min(1).max(100),
      data: z.string().min(1),
      ...trackFields,
    })
    .describe(
      "Upload a small (<=8MB) base64-encoded track and add it to the album in one step. GM only, " +
        "changes data.",
    ),
  z
    .object({ action: z.literal("list_sound_fx"), campaign_id: uuid, limit: limitField })
    .describe("List a campaign's one-shot sound effects, in their play order."),
  z
    .object({
      action: z.literal("create_sound_fx"),
      campaign_id: uuid,
      title: z.string().min(1).max(200),
      storage_path: z.string().min(1).max(400),
      file_name: z.string().min(1).max(300),
      byte_size: intField(1, CAMPAIGN_SOUND_FX_MAX_BYTES, "byte_size"),
      mime_type: z.string().min(1).max(100),
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Create a sound effect from audio already uploaded via prepare_effect_upload. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("update_sound_fx"),
      effect_id: uuid,
      title: z.string().min(1).max(200).optional(),
    })
    .describe("Update a sound effect's title. GM only, changes data."),
  z
    .object({ action: z.literal("delete_sound_fx"), effect_id: uuid })
    .describe("Delete a sound effect and its stored file. GM only, deletes data."),
  z
    .object({
      action: z.literal("reorder_sound_fx"),
      campaign_id: uuid,
      ordered_ids: z.array(uuid).min(1).max(500),
    })
    .describe(
      "Rewrite the campaign's sound effect play order to match ordered_ids exactly. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("set_sound_fx_visibility"),
      effect_id: uuid,
      visible_to_players: z.boolean(),
    })
    .describe("Show or hide a sound effect from players. GM only, changes data."),
  z
    .object({ action: z.literal("get_sound_fx_url"), effect_id: uuid })
    .describe("Get a short-lived signed URL to play a sound effect."),
  z
    .object({ action: z.literal("trigger_sound_fx"), campaign_id: uuid, effect_id: uuid })
    .describe(
      "Fire a one-shot sound effect event for everyone in the campaign. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("prepare_effect_upload"),
      campaign_id: uuid,
      file_name: z.string().min(1).max(300),
      mime_type: z.string().min(1).max(100),
      byte_size: intField(1, CAMPAIGN_SOUND_FX_MAX_BYTES, "byte_size"),
    })
    .describe(
      "Get a short-lived signed target to upload a sound effect's audio file to. GM only, changes data.",
    ),
  z
    .object({
      action: z.literal("upload_effect_from_url"),
      campaign_id: uuid,
      url: z.string().url(),
      title: z.string().min(1).max(200),
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Disabled for security reasons: use prepare_effect_upload + create_sound_fx, or upload_effect_base64.",
    ),
  z
    .object({
      action: z.literal("upload_effect_base64"),
      campaign_id: uuid,
      file_name: z.string().min(1).max(300),
      mime_type: z.string().min(1).max(100),
      data: z.string().min(1),
      title: z.string().min(1).max(200),
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Upload a small (<=8MB) base64-encoded sound effect and create it in one step. GM only, changes data.",
    ),
]);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function requireMember(ctx: McpToolContext, campaignId: string): Promise<void> {
  if (!(await isCampaignMember(ctx, campaignId))) {
    throw new Error("You are not a member of this campaign.");
  }
}

interface AlbumRow {
  id: string;
  campaign_id: string;
  cover_path: string;
  [key: string]: unknown;
}

async function loadAlbum(ctx: McpToolContext, albumId: string): Promise<AlbumRow> {
  const { data, error } = await ctx.supabase
    .from("campaign_soundtrack_albums")
    .select("*")
    .eq("id", albumId)
    .maybeSingle();
  if (error) fail("Album lookup", error);
  if (!data) throw new Error("Album not found, or you do not have access to it.");
  return data as AlbumRow;
}

interface TrackRow {
  id: string;
  campaign_id: string;
  album_id: string;
  storage_path: string;
  [key: string]: unknown;
}

async function loadTrack(ctx: McpToolContext, trackId: string): Promise<TrackRow> {
  const { data, error } = await ctx.supabase
    .from("campaign_soundtrack_tracks")
    .select("*")
    .eq("id", trackId)
    .maybeSingle();
  if (error) fail("Track lookup", error);
  if (!data) throw new Error("Track not found, or you do not have access to it.");
  return data as TrackRow;
}

interface EffectRow {
  id: string;
  campaign_id: string;
  storage_path: string;
  sort_order: number;
  [key: string]: unknown;
}

async function loadEffect(ctx: McpToolContext, effectId: string): Promise<EffectRow> {
  const { data, error } = await ctx.supabase
    .from("campaign_sound_fx")
    .select("*")
    .eq("id", effectId)
    .maybeSingle();
  if (error) fail("Sound effect lookup", error);
  if (!data) throw new Error("Sound effect not found, or you do not have access to it.");
  return data as EffectRow;
}

/* ------------------------------------------------------------------ */
/* Shared playback state (anchor + derived position)                    */
/* ------------------------------------------------------------------ */

export interface SoundtrackStateRow {
  campaign_id: string;
  album_id: string | null;
  track_id: string | null;
  is_playing: boolean;
  anchor_position_seconds: number;
  anchored_at: string;
  loop_one: boolean;
  [key: string]: unknown;
}

async function loadPlayback(
  ctx: McpToolContext,
  campaignId: string,
): Promise<SoundtrackStateRow | null> {
  const { data, error } = await ctx.supabase
    .from("campaign_soundtrack_state")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) fail("Reading playback state", error);
  return (data as SoundtrackStateRow | null) ?? null;
}

async function trackDuration(ctx: McpToolContext, trackId: string | null): Promise<number | null> {
  if (!trackId) return null;
  const { data, error } = await ctx.supabase
    .from("campaign_soundtrack_tracks")
    .select("duration_seconds")
    .eq("id", trackId)
    .maybeSingle();
  if (error) fail("Reading track duration", error);
  const value = data?.duration_seconds;
  return typeof value === "number" ? value : null;
}

/** Writes a new anchor, keeping the legacy columns in step for older clients. */
async function writePlayback(
  ctx: McpToolContext,
  campaignId: string,
  next: {
    album_id: string | null;
    track_id: string | null;
    is_playing: boolean;
    position_seconds: number;
    loop_one: boolean;
  },
): Promise<SoundtrackStateRow> {
  const now = new Date().toISOString();
  const position = Math.max(0, next.position_seconds);
  const { data, error } = await anyDb(ctx.supabase)
    .from("campaign_soundtrack_state")
    .upsert({
      campaign_id: campaignId,
      album_id: next.album_id,
      track_id: next.track_id,
      is_playing: next.is_playing,
      position_seconds: Math.round(position),
      anchor_position_seconds: position,
      anchored_at: now,
      loop_one: next.loop_one,
      changed_at: now,
      changed_by: ctx.userId,
    })
    .select("*")
    .single();
  if (error) fail("Setting playback state", error);
  return data as SoundtrackStateRow;
}

/** The row as callers should see it: live position, never the raw anchor alone. */
async function playbackView(
  ctx: McpToolContext,
  row: SoundtrackStateRow | null,
): Promise<Structured> {
  if (!row) {
    return {
      track_id: null,
      album_id: null,
      is_playing: false,
      position_seconds: 0,
      duration_seconds: null,
      loop_one: false,
    };
  }
  const duration = await trackDuration(ctx, row.track_id);
  return {
    ...row,
    position_seconds: derivePlaybackPosition(row, duration),
    duration_seconds: duration,
  };
}

/** Freezes the live position into the anchor so pause/seek keep the exact point. */
function currentPosition(row: SoundtrackStateRow | null, duration: number | null): number {
  return derivePlaybackPosition(row, duration);
}

async function requirePlaybackGm(ctx: McpToolContext, campaignId: string) {
  const campaign = await loadCampaign(ctx, campaignId);
  requireGmFor(campaign, "control soundtrack playback");
  return campaign;
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerCampaignAudio(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "campaign_audio",
    {
      title: "Campaign audio",
      description:
        "Manage a campaign's soundtrack albums/tracks and one-shot sound effects. Actions: list " +
        "(read albums with their tracks, plus the campaign's current playback block), create_album/update_album/delete_album (GM only, " +
        "delete_album removes stored files, changes/deletes data), set_album_visibility (GM only, " +
        "changes data), add_track/update_track/delete_track (GM only, delete_track removes the " +
        "stored file, changes/deletes data), get_track_url (short-lived signed URL), play/pause/resume/seek/stop/" +
        "set_loop (GM only, shared playback control; pause freezes the exact current point and " +
        "resume continues from it, changes data), get_playback (read the shared state with " +
        "position_seconds already derived from the anchor plus the track's duration_seconds), " +
        "set_playback (legacy one-call form, still supported, GM only, changes data), prepare_cover_upload/upload_cover_base64 " +
        "(GM only, stage a cover image for create_album/update_album, changes data; " +
        "upload_cover_from_url is disabled for security reasons), " +
        "prepare_track_upload/upload_track_base64 (GM only, stage or add " +
        "track audio, changes data; upload_track_from_url is disabled for security reasons), " +
        "list_sound_fx (read), create_sound_fx/update_sound_fx/" +
        "delete_sound_fx (GM only, delete_sound_fx removes the stored file, changes/deletes data), " +
        "reorder_sound_fx (GM only, rewrites play order, changes data), set_sound_fx_visibility " +
        "(GM only, changes data), get_sound_fx_url (short-lived signed URL), trigger_sound_fx (GM " +
        "only, fires a shared event, changes data), prepare_effect_upload/" +
        "upload_effect_base64 (GM only, stage or create a sound effect, changes data; " +
        "upload_effect_from_url is disabled for security reasons).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      list: async (i) => {
        await requireMember(ctx, i.campaign_id);
        const limit = i.limit ?? 50;
        const [albumsResult, tracksResult] = await Promise.all([
          ctx.supabase
            .from("campaign_soundtrack_albums")
            .select("*")
            .eq("campaign_id", i.campaign_id)
            .order("created_at")
            .limit(limit),
          ctx.supabase
            .from("campaign_soundtrack_tracks")
            .select("*")
            .eq("campaign_id", i.campaign_id)
            .order("position"),
        ]);
        if (albumsResult.error) fail("Listing albums", albumsResult.error);
        if (tracksResult.error) fail("Listing tracks", tracksResult.error);
        const albums = albumsResult.data ?? [];
        const tracks = tracksResult.data ?? [];
        const items: Structured[] = albums.map((album) => ({
          ...album,
          tracks: tracks.filter((track) => track.album_id === album.id),
        }));
        const { count, error } = await ctx.supabase
          .from("campaign_soundtrack_albums")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", i.campaign_id);
        if (error) fail("Counting albums", error);
        const playback = await playbackView(ctx, await loadPlayback(ctx, i.campaign_id));
        return listReply("soundtrack albums", items, count ?? items.length, { playback });
      },

      create_album: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "add a soundtrack album");
        await verifyStoredObject(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, i.cover_storage_path, {
          maxBytes: CAMPAIGN_COVER_MAX_BYTES,
          allowedMime: CAMPAIGN_COVER_MIME_TYPES,
        });
        const { data, error } = await ctx.supabase
          .from("campaign_soundtrack_albums")
          .insert({
            campaign_id: i.campaign_id,
            cover_path: i.cover_storage_path,
            title: i.title,
            slug: i.slug,
            subtitle: i.subtitle ?? null,
            description: i.description ?? null,
            composer: i.composer ?? null,
            release_year: i.release_year ?? null,
            game_slug: i.game_slug ?? null,
            status: i.status ?? "published",
            visible_to_players: i.visible_to_players ?? true,
            created_by: ctx.userId,
          })
          .select("*")
          .single();
        if (error) fail("Creating album", error);
        return detailReply(`Album "${i.title}" created in "${campaign.name}".`, data);
      },

      update_album: async (i) => {
        const album = await loadAlbum(ctx, i.album_id);
        const campaign = await loadCampaign(ctx, album.campaign_id);
        requireGmFor(campaign, "update a soundtrack album");
        const patch: Record<string, unknown> = {};
        if (i.title !== undefined) patch["title"] = i.title;
        if (i.slug !== undefined) patch["slug"] = i.slug;
        if (i.subtitle !== undefined) patch["subtitle"] = i.subtitle;
        if (i.description !== undefined) patch["description"] = i.description;
        if (i.composer !== undefined) patch["composer"] = i.composer;
        if (i.release_year !== undefined) patch["release_year"] = i.release_year;
        if (i.game_slug !== undefined) patch["game_slug"] = i.game_slug;
        if (i.status !== undefined) patch["status"] = i.status;
        let staleCover: string | null = null;
        if (i.cover_storage_path !== undefined) {
          await verifyStoredObject(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, i.cover_storage_path, {
            maxBytes: CAMPAIGN_COVER_MAX_BYTES,
            allowedMime: CAMPAIGN_COVER_MIME_TYPES,
          });
          patch["cover_path"] = i.cover_storage_path;
          staleCover = album.cover_path;
        }
        if (Object.keys(patch).length === 0)
          throw new Error("Nothing to update — no fields given.");
        const { data, error } = await ctx.supabase
          .from("campaign_soundtrack_albums")
          .update(dbPayload<TablesUpdate<"campaign_soundtrack_albums">>(patch))
          .eq("id", i.album_id)
          .select("*")
          .single();
        if (error) fail("Updating album", error);
        if (staleCover)
          await removeStoredObject(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, staleCover);
        return detailReply(`Album "${album["title"]}" updated.`, data);
      },

      delete_album: async (i) => {
        const album = await loadAlbum(ctx, i.album_id);
        const campaign = await loadCampaign(ctx, album.campaign_id);
        requireGmFor(campaign, "delete a soundtrack album");
        const { data: tracks, error: tracksError } = await ctx.supabase
          .from("campaign_soundtrack_tracks")
          .select("storage_path")
          .eq("album_id", i.album_id);
        if (tracksError) fail("Loading tracks for deletion", tracksError);
        const { error } = await ctx.supabase
          .from("campaign_soundtrack_albums")
          .delete()
          .eq("id", i.album_id);
        if (error) fail("Deleting album", error);
        const paths = [album.cover_path, ...(tracks ?? []).map((track) => track.storage_path)];
        if (paths.length) await ctx.supabase.storage.from(CAMPAIGN_SOUNDTRACK_BUCKET).remove(paths);
        return deleteReply(`Album "${album["title"]}" and its tracks deleted.`, i.album_id);
      },

      set_album_visibility: async (i) => {
        const album = await loadAlbum(ctx, i.album_id);
        const campaign = await loadCampaign(ctx, album.campaign_id);
        requireGmFor(campaign, "change album visibility");
        const { data, error } = await ctx.supabase
          .from("campaign_soundtrack_albums")
          .update({ visible_to_players: i.visible_to_players })
          .eq("id", i.album_id)
          .select("*")
          .single();
        if (error) fail("Setting album visibility", error);
        return detailReply(
          `Album "${album["title"]}" is now ${i.visible_to_players ? "visible to" : "hidden from"} players.`,
          data,
        );
      },

      add_track: async (i) => {
        const album = await loadAlbum(ctx, i.album_id);
        const campaign = await loadCampaign(ctx, album.campaign_id);
        requireGmFor(campaign, "add a track");
        await verifyStoredObject(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, i.storage_path, {
          maxBytes: CAMPAIGN_SOUNDTRACK_TRACK_MAX_BYTES,
          allowedMime: SOUNDTRACK_TRACK_MIME_TYPES,
        });
        const { data, error } = await ctx.supabase
          .from("campaign_soundtrack_tracks")
          .insert({
            campaign_id: album.campaign_id,
            album_id: i.album_id,
            storage_path: i.storage_path,
            file_name: i.file_name,
            byte_size: i.byte_size,
            mime_type: i.mime_type,
            title: i.title,
            position: i.position,
            composer: i.composer ?? null,
            duration_seconds: i.duration_seconds ?? null,
            lyrics: i.lyrics ?? null,
          })
          .select("*")
          .single();
        if (error) fail("Adding track", error);
        return detailReply(`Track "${i.title}" added to "${album["title"]}".`, data);
      },

      update_track: async (i) => {
        const track = await loadTrack(ctx, i.track_id);
        const campaign = await loadCampaign(ctx, track.campaign_id);
        requireGmFor(campaign, "update a track");
        const patch: Record<string, unknown> = {};
        if (i.title !== undefined) patch["title"] = i.title;
        if (i.position !== undefined) patch["position"] = i.position;
        if (i.composer !== undefined) patch["composer"] = i.composer;
        if (i.duration_seconds !== undefined) patch["duration_seconds"] = i.duration_seconds;
        if (i.lyrics !== undefined) patch["lyrics"] = i.lyrics;
        if (Object.keys(patch).length === 0)
          throw new Error("Nothing to update — no fields given.");
        const { data, error } = await ctx.supabase
          .from("campaign_soundtrack_tracks")
          .update(dbPayload<TablesUpdate<"campaign_soundtrack_tracks">>(patch))
          .eq("id", i.track_id)
          .select("*")
          .single();
        if (error) fail("Updating track", error);
        return detailReply(`Track "${track["title"]}" updated.`, data);
      },

      delete_track: async (i) => {
        const track = await loadTrack(ctx, i.track_id);
        const campaign = await loadCampaign(ctx, track.campaign_id);
        requireGmFor(campaign, "delete a track");
        const { error } = await ctx.supabase
          .from("campaign_soundtrack_tracks")
          .delete()
          .eq("id", i.track_id);
        if (error) fail("Deleting track", error);
        await removeStoredObject(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, track.storage_path);
        return deleteReply(`Track "${track["title"]}" deleted.`, i.track_id);
      },

      get_track_url: async (i) => {
        const track = await loadTrack(ctx, i.track_id);
        await requireMember(ctx, track.campaign_id);
        const url = await signedReadUrl(
          ctx.supabase,
          CAMPAIGN_SOUNDTRACK_BUCKET,
          track.storage_path,
        );
        return detailReply(`Signed link for "${track["title"]}".`, { track_id: i.track_id, url });
      },

      set_playback: async (i) => {
        const campaign = await requirePlaybackGm(ctx, i.campaign_id);
        const row = await writePlayback(ctx, i.campaign_id, {
          album_id: i.album_id ?? null,
          track_id: i.track_id ?? null,
          is_playing: i.is_playing,
          position_seconds: i.position_seconds,
          loop_one: i.loop_one,
        });
        return detailReply(
          `Playback state updated for "${campaign.name}".`,
          await playbackView(ctx, row),
        );
      },

      play: async (i) => {
        const campaign = await requirePlaybackGm(ctx, i.campaign_id);
        const track = await loadTrack(ctx, i.track_id);
        if (track.campaign_id !== i.campaign_id)
          throw new Error("That track belongs to another campaign.");
        const current = await loadPlayback(ctx, i.campaign_id);
        const row = await writePlayback(ctx, i.campaign_id, {
          album_id: track.album_id,
          track_id: track.id,
          is_playing: true,
          position_seconds: i.position_seconds ?? 0,
          loop_one: i.loop_one ?? current?.loop_one ?? false,
        });
        return detailReply(
          `Playing "${String(track["title"] ?? "track")}" in "${campaign.name}".`,
          await playbackView(ctx, row),
        );
      },

      pause: async (i) => {
        await requirePlaybackGm(ctx, i.campaign_id);
        const current = await loadPlayback(ctx, i.campaign_id);
        if (!current?.track_id) throw new Error("Nothing is playing in this campaign.");
        const duration = await trackDuration(ctx, current.track_id);
        const row = await writePlayback(ctx, i.campaign_id, {
          album_id: current.album_id,
          track_id: current.track_id,
          is_playing: false,
          position_seconds: currentPosition(current, duration),
          loop_one: current.loop_one,
        });
        return detailReply("Playback paused.", await playbackView(ctx, row));
      },

      resume: async (i) => {
        await requirePlaybackGm(ctx, i.campaign_id);
        const current = await loadPlayback(ctx, i.campaign_id);
        if (!current?.track_id) throw new Error("There is no track to resume.");
        const row = await writePlayback(ctx, i.campaign_id, {
          album_id: current.album_id,
          track_id: current.track_id,
          is_playing: true,
          position_seconds: Math.max(0, Number(current.anchor_position_seconds) || 0),
          loop_one: current.loop_one,
        });
        return detailReply("Playback resumed.", await playbackView(ctx, row));
      },

      seek: async (i) => {
        await requirePlaybackGm(ctx, i.campaign_id);
        const current = await loadPlayback(ctx, i.campaign_id);
        if (!current?.track_id) throw new Error("There is no track to seek.");
        const row = await writePlayback(ctx, i.campaign_id, {
          album_id: current.album_id,
          track_id: current.track_id,
          is_playing: current.is_playing,
          position_seconds: i.position_seconds,
          loop_one: current.loop_one,
        });
        return detailReply("Playback position set.", await playbackView(ctx, row));
      },

      stop: async (i) => {
        await requirePlaybackGm(ctx, i.campaign_id);
        const current = await loadPlayback(ctx, i.campaign_id);
        const row = await writePlayback(ctx, i.campaign_id, {
          album_id: current?.album_id ?? null,
          track_id: current?.track_id ?? null,
          is_playing: false,
          position_seconds: 0,
          loop_one: current?.loop_one ?? false,
        });
        return detailReply("Playback stopped.", await playbackView(ctx, row));
      },

      set_loop: async (i) => {
        await requirePlaybackGm(ctx, i.campaign_id);
        const current = await loadPlayback(ctx, i.campaign_id);
        const duration = await trackDuration(ctx, current?.track_id ?? null);
        const row = await writePlayback(ctx, i.campaign_id, {
          album_id: current?.album_id ?? null,
          track_id: current?.track_id ?? null,
          is_playing: current?.is_playing ?? false,
          position_seconds: currentPosition(current, duration),
          loop_one: i.loop_one,
        });
        return detailReply(
          i.loop_one ? "Repeat-one turned on." : "Repeat-one turned off.",
          await playbackView(ctx, row),
        );
      },

      get_playback: async (i) => {
        await requireMember(ctx, i.campaign_id);
        const view = await playbackView(ctx, await loadPlayback(ctx, i.campaign_id));
        return detailReply("Current soundtrack playback state.", view);
      },

      prepare_cover_upload: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload an album cover");
        if (i.byte_size > CAMPAIGN_COVER_MAX_BYTES)
          throw new Error("That cover image is too large.");
        if (!CAMPAIGN_COVER_MIME_TYPES.includes(i.mime_type.toLowerCase() as never)) {
          throw new Error("Use an AVIF, WebP, JPEG, or PNG image.");
        }
        const path = storagePathFor(`${ctx.userId}/${i.campaign_id}/covers`, i.file_name);
        const prepared = await prepareSignedUpload(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, path);
        return detailReply("Upload target prepared for an album cover.", { ...prepared });
      },

      // TD-002: disabled — see fetchRemoteFile in uploads.server.ts for why
      // resolve+pin SSRF protection is not achievable on this runtime.
      upload_cover_from_url: async () => {
        throw new Error(
          "Downloading files from a web address is turned off for security reasons. " +
            "Use prepare_cover_upload instead, or send small images directly with upload_cover_base64.",
        );
      },

      upload_cover_base64: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload an album cover");
        const file = decodeBase64File(i.data, i.mime_type, {
          maxBytes: CAMPAIGN_COVER_MAX_BYTES,
          allowedMime: CAMPAIGN_COVER_MIME_TYPES,
        });
        const path = storagePathFor(`${ctx.userId}/${i.campaign_id}/covers`, i.file_name);
        await uploadBytes(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, path, file);
        return detailReply("Cover image uploaded.", {
          storage_path: path,
          byte_size: file.size,
          mime_type: file.mime,
        });
      },

      prepare_track_upload: async (i) => {
        const album = await loadAlbum(ctx, i.album_id);
        const campaign = await loadCampaign(ctx, album.campaign_id);
        requireGmFor(campaign, "upload a track");
        if (i.byte_size > CAMPAIGN_SOUNDTRACK_TRACK_MAX_BYTES) {
          throw new Error("That track is too large.");
        }
        if (!SOUNDTRACK_TRACK_MIME_TYPES.includes(i.mime_type.toLowerCase() as never)) {
          throw new Error("Use an MP3, OGG, Opus, M4A, WAV, or WebM audio file.");
        }
        const path = storagePathFor(
          `${ctx.userId}/${album.campaign_id}/${i.album_id}/tracks`,
          i.file_name,
        );
        const prepared = await prepareSignedUpload(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, path);
        return detailReply("Upload target prepared for a track.", { ...prepared });
      },

      // TD-002: disabled — see fetchRemoteFile in uploads.server.ts for why
      // resolve+pin SSRF protection is not achievable on this runtime.
      upload_track_from_url: async () => {
        throw new Error(
          "Downloading files from a web address is turned off for security reasons. " +
            "Use prepare_track_upload instead, or send small tracks directly with upload_track_base64.",
        );
      },

      upload_track_base64: async (i) => {
        const album = await loadAlbum(ctx, i.album_id);
        const campaign = await loadCampaign(ctx, album.campaign_id);
        requireGmFor(campaign, "upload a track");
        const file = decodeBase64File(i.data, i.mime_type, {
          maxBytes: CAMPAIGN_SOUNDTRACK_TRACK_MAX_BYTES,
          allowedMime: SOUNDTRACK_TRACK_MIME_TYPES,
        });
        const path = storagePathFor(
          `${ctx.userId}/${album.campaign_id}/${i.album_id}/tracks`,
          i.file_name,
        );
        await uploadBytes(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, path, file);
        const { data, error } = await ctx.supabase
          .from("campaign_soundtrack_tracks")
          .insert({
            campaign_id: album.campaign_id,
            album_id: i.album_id,
            storage_path: path,
            file_name: i.file_name,
            byte_size: file.size,
            mime_type: file.mime,
            title: i.title,
            position: i.position,
            composer: i.composer ?? null,
            duration_seconds: i.duration_seconds ?? null,
            lyrics: i.lyrics ?? null,
          })
          .select("*")
          .single();
        if (error) {
          await removeStoredObject(ctx.supabase, CAMPAIGN_SOUNDTRACK_BUCKET, path);
          fail("Adding track", error);
        }
        return detailReply(`Track "${i.title}" uploaded and added to "${album["title"]}".`, data);
      },

      list_sound_fx: async (i) => {
        await requireMember(ctx, i.campaign_id);
        const limit = i.limit ?? 50;
        const { data, error } = await ctx.supabase
          .from("campaign_sound_fx")
          .select("*")
          .eq("campaign_id", i.campaign_id)
          .order("sort_order")
          .order("created_at")
          .limit(limit);
        if (error) fail("Listing sound effects", error);
        const { count, error: countError } = await ctx.supabase
          .from("campaign_sound_fx")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", i.campaign_id);
        if (countError) fail("Counting sound effects", countError);
        return listReply("sound effects", data ?? [], count ?? (data ?? []).length);
      },

      create_sound_fx: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "add a sound effect");
        await verifyStoredObject(ctx.supabase, CAMPAIGN_SOUND_FX_BUCKET, i.storage_path, {
          maxBytes: CAMPAIGN_SOUND_FX_MAX_BYTES,
          allowedMime: SOUND_FX_MIME_TYPES,
        });
        const { data: last, error: lastError } = await ctx.supabase
          .from("campaign_sound_fx")
          .select("sort_order")
          .eq("campaign_id", i.campaign_id)
          .order("sort_order", { ascending: false })
          .limit(1);
        if (lastError) fail("Reading sort order", lastError);
        const nextSort = (last?.[0]?.sort_order ?? -1) + 1;
        const { data, error } = await ctx.supabase
          .from("campaign_sound_fx")
          .insert({
            campaign_id: i.campaign_id,
            title: i.title,
            storage_path: i.storage_path,
            file_name: i.file_name,
            byte_size: i.byte_size,
            mime_type: i.mime_type,
            created_by: ctx.userId,
            sort_order: nextSort,
            visible_to_players: i.visible_to_players ?? true,
          })
          .select("*")
          .single();
        if (error) fail("Creating sound effect", error);
        return detailReply(`Sound effect "${i.title}" created in "${campaign.name}".`, data);
      },

      update_sound_fx: async (i) => {
        const effect = await loadEffect(ctx, i.effect_id);
        const campaign = await loadCampaign(ctx, effect.campaign_id);
        requireGmFor(campaign, "update a sound effect");
        if (i.title === undefined) throw new Error("Nothing to update — no fields given.");
        const { data, error } = await ctx.supabase
          .from("campaign_sound_fx")
          .update({ title: i.title })
          .eq("id", i.effect_id)
          .select("*")
          .single();
        if (error) fail("Updating sound effect", error);
        return detailReply(`Sound effect "${i.title}" updated.`, data);
      },

      delete_sound_fx: async (i) => {
        const effect = await loadEffect(ctx, i.effect_id);
        const campaign = await loadCampaign(ctx, effect.campaign_id);
        requireGmFor(campaign, "delete a sound effect");
        const { error } = await ctx.supabase
          .from("campaign_sound_fx")
          .delete()
          .eq("id", i.effect_id);
        if (error) fail("Deleting sound effect", error);
        await removeStoredObject(ctx.supabase, CAMPAIGN_SOUND_FX_BUCKET, effect.storage_path);
        return deleteReply(`Sound effect "${effect["title"]}" deleted.`, i.effect_id);
      },

      reorder_sound_fx: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "reorder sound effects");
        const { data: owned, error } = await ctx.supabase
          .from("campaign_sound_fx")
          .select("id")
          .eq("campaign_id", i.campaign_id)
          .in("id", i.ordered_ids);
        if (error) fail("Checking sound effect ownership", error);
        const ownedIds = new Set((owned ?? []).map((row) => row.id));
        const uniqueIds = new Set(i.ordered_ids);
        if (uniqueIds.size !== i.ordered_ids.length) {
          throw new Error("ordered_ids contains duplicates.");
        }
        for (const id of i.ordered_ids) {
          if (!ownedIds.has(id)) {
            throw new Error(`Sound effect ${id} does not belong to "${campaign.name}".`);
          }
        }
        const results = await Promise.all(
          i.ordered_ids.map((id, index) =>
            ctx.supabase.from("campaign_sound_fx").update({ sort_order: index }).eq("id", id),
          ),
        );
        for (const result of results)
          if (result.error) fail("Reordering sound effects", result.error);
        return detailReply(`Reordered ${i.ordered_ids.length} sound effects.`, {
          campaign_id: i.campaign_id,
          ordered_ids: i.ordered_ids,
        });
      },

      set_sound_fx_visibility: async (i) => {
        const effect = await loadEffect(ctx, i.effect_id);
        const campaign = await loadCampaign(ctx, effect.campaign_id);
        requireGmFor(campaign, "change sound effect visibility");
        const { data, error } = await ctx.supabase
          .from("campaign_sound_fx")
          .update({ visible_to_players: i.visible_to_players })
          .eq("id", i.effect_id)
          .select("*")
          .single();
        if (error) fail("Setting sound effect visibility", error);
        return detailReply(
          `Sound effect "${effect["title"]}" is now ${
            i.visible_to_players ? "visible to" : "hidden from"
          } players.`,
          data,
        );
      },

      get_sound_fx_url: async (i) => {
        const effect = await loadEffect(ctx, i.effect_id);
        await requireMember(ctx, effect.campaign_id);
        const url = await signedReadUrl(
          ctx.supabase,
          CAMPAIGN_SOUND_FX_BUCKET,
          effect.storage_path,
        );
        return detailReply(`Signed link for "${effect["title"]}".`, {
          effect_id: i.effect_id,
          url,
        });
      },

      trigger_sound_fx: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "trigger a sound effect");
        const effect = await loadEffect(ctx, i.effect_id);
        if (effect.campaign_id !== i.campaign_id) {
          throw new Error("That sound effect does not belong to this campaign.");
        }
        const { data, error } = await ctx.supabase
          .from("campaign_sound_fx_state")
          .upsert({
            campaign_id: i.campaign_id,
            effect_id: i.effect_id,
            event_id: crypto.randomUUID(),
            changed_by: ctx.userId,
            changed_at: new Date().toISOString(),
          })
          .select("*")
          .single();
        if (error) fail("Triggering sound effect", error);
        return detailReply(`Triggered "${effect["title"]}" for "${campaign.name}".`, data);
      },

      prepare_effect_upload: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload a sound effect");
        if (i.byte_size > CAMPAIGN_SOUND_FX_MAX_BYTES)
          throw new Error("That sound effect is too large.");
        if (!SOUND_FX_MIME_TYPES.includes(i.mime_type.toLowerCase() as never)) {
          throw new Error("Use an MP3, OGG, Opus, M4A, WAV, or WebM audio file.");
        }
        const path = storagePathFor(`${ctx.userId}/${i.campaign_id}`, i.file_name);
        const prepared = await prepareSignedUpload(ctx.supabase, CAMPAIGN_SOUND_FX_BUCKET, path);
        return detailReply("Upload target prepared for a sound effect.", { ...prepared });
      },

      // TD-002: disabled — see fetchRemoteFile in uploads.server.ts for why
      // resolve+pin SSRF protection is not achievable on this runtime.
      upload_effect_from_url: async () => {
        throw new Error(
          "Downloading files from a web address is turned off for security reasons. " +
            "Use prepare_effect_upload instead, or send small effects directly with upload_effect_base64.",
        );
      },

      upload_effect_base64: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload a sound effect");
        const file = decodeBase64File(i.data, i.mime_type, {
          maxBytes: CAMPAIGN_SOUND_FX_MAX_BYTES,
          allowedMime: SOUND_FX_MIME_TYPES,
        });
        const path = storagePathFor(`${ctx.userId}/${i.campaign_id}`, i.file_name);
        await uploadBytes(ctx.supabase, CAMPAIGN_SOUND_FX_BUCKET, path, file);
        const { data: last, error: lastError } = await ctx.supabase
          .from("campaign_sound_fx")
          .select("sort_order")
          .eq("campaign_id", i.campaign_id)
          .order("sort_order", { ascending: false })
          .limit(1);
        if (lastError) {
          await removeStoredObject(ctx.supabase, CAMPAIGN_SOUND_FX_BUCKET, path);
          fail("Reading sort order", lastError);
        }
        const nextSort = (last?.[0]?.sort_order ?? -1) + 1;
        const { data, error } = await ctx.supabase
          .from("campaign_sound_fx")
          .insert({
            campaign_id: i.campaign_id,
            title: i.title,
            storage_path: path,
            file_name: i.file_name,
            byte_size: file.size,
            mime_type: file.mime,
            created_by: ctx.userId,
            sort_order: nextSort,
            visible_to_players: i.visible_to_players ?? true,
          })
          .select("*")
          .single();
        if (error) {
          await removeStoredObject(ctx.supabase, CAMPAIGN_SOUND_FX_BUCKET, path);
          fail("Creating sound effect", error);
        }
        return detailReply(`Sound effect "${i.title}" uploaded and created.`, data);
      },
    }),
  );
}
