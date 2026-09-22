/**
 * Campaign videos: MP4 intros, recaps, cutscenes and other campaign clips.
 *
 * Bucket, size limit, MIME rule and the "only one intro per campaign" rule are
 * the same ones the app enforces — see `src/lib/campaign-intro.ts`.
 */

import { z } from "zod/v4";
import {
  actionRouter,
  boundedText,
  buildPatch,
  deleteReply,
  detailReply,
  domainOutput,
  fail,
  isCampaignMember,
  limitField,
  listReply,
  loadCampaign,
  requireGmFor,
  requirePatch,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, Structured, ToolRegistrar } from "@/lib/mcp/kit.server";
import type { Database } from "@/integrations/supabase/types";
import {
  CAMPAIGN_INTRO_BUCKET,
  CAMPAIGN_VIDEO_MAX_BYTES,
  CAMPAIGN_VIDEO_TYPES,
} from "@/lib/campaign-intro";
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

const VIDEO_MIME = ["video/mp4"] as const;
const THUMB_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const THUMB_MAX_BYTES = 5 * 1024 * 1024;

const videoType = z.enum(CAMPAIGN_VIDEO_TYPES);

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("list"), campaign_id: uuid, limit: limitField })
    .describe(
      "List a campaign's videos. Members see only videos visible to players; the GM sees all.",
    ),
  z.object({ action: z.literal("get"), video_id: uuid }).describe("Read one video's metadata."),
  z
    .object({
      action: z.literal("update"),
      video_id: uuid,
      title: boundedText(200).optional(),
      video_type: videoType.optional(),
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Update a video's title, type, or player visibility. Omitted fields are unchanged. A campaign can only have one intro video, so switching a video to the intro type is refused while another intro exists. GM only. Changes data.",
    ),
  z
    .object({ action: z.literal("delete"), video_id: uuid })
    .describe("Delete a video and its stored file and thumbnail. GM only. Deletes data."),
  z
    .object({
      action: z.literal("set_visibility"),
      video_id: uuid,
      visible_to_players: z.boolean(),
    })
    .describe("Set whether players can see a video. GM only. Changes data."),
  z
    .object({ action: z.literal("get_url"), video_id: uuid })
    .describe("Get a short-lived signed URL to play the video file."),
  z
    .object({ action: z.literal("get_thumb_url"), video_id: uuid })
    .describe("Get a short-lived signed URL for the video's thumbnail image."),
  z
    .object({
      action: z.literal("prepare_upload"),
      campaign_id: uuid,
      file_name: boundedText(255),
      byte_size: z.number().int().min(1).max(CAMPAIGN_VIDEO_MAX_BYTES),
    })
    .describe(
      "Get a short-lived signed upload target for a new MP4 video. GM only. Follow with finalize_upload.",
    ),
  z
    .object({
      action: z.literal("finalize_upload"),
      campaign_id: uuid,
      storage_path: boundedText(400),
      title: boundedText(200),
      video_type: videoType,
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Create the video row after the MP4 was written to the path from prepare_upload. Uploading a new intro replaces the campaign's current intro. GM only. Changes data.",
    ),
  z
    .object({
      action: z.literal("upload_from_url"),
      campaign_id: uuid,
      url: z.string().max(2000),
      title: boundedText(200),
      video_type: videoType,
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Disabled for security reasons: use prepare_upload + finalize_upload, or upload_base64 for small clips.",
    ),
  z
    .object({
      action: z.literal("upload_base64"),
      campaign_id: uuid,
      data: z.string().max(12_000_000),
      file_name: boundedText(255),
      title: boundedText(200),
      video_type: videoType,
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Create the video from base64-encoded MP4 bytes. Only suitable for small clips; use prepare_upload or upload_from_url for anything large. GM only. Changes data.",
    ),
  z
    .object({
      action: z.literal("prepare_thumb_upload"),
      video_id: uuid,
      file_name: boundedText(255),
      mime_type: z.string().max(120),
      byte_size: z.number().int().min(1).max(THUMB_MAX_BYTES),
    })
    .describe(
      "Get a short-lived signed upload target for a video thumbnail image. GM only. Follow with set_thumb.",
    ),
  z
    .object({
      action: z.literal("set_thumb"),
      video_id: uuid,
      storage_path: boundedText(400).optional(),
      url: z.string().max(2000).optional(),
      data: z.string().max(8_000_000).optional(),
      mime_type: z.string().max(120).optional(),
      file_name: boundedText(255).optional(),
    })
    .describe(
      "Set a video's thumbnail from exactly one source: storage_path (after prepare_thumb_upload), a public https url, or base64 data with mime_type. The previous thumbnail file is removed. GM only. Changes data.",
    ),
]);

interface VideoRow {
  id: string;
  campaign_id: string;
  title: string;
  video_type: string;
  storage_path: string;
  thumb_path: string | null;
  file_name: string;
  byte_size: number;
  mime_type: string;
  version: string;
  visible_to_players: boolean;
  created_by: string;
  created_at: string;
}

type VideoInsert = Database["public"]["Tables"]["campaign_videos"]["Insert"];
type VideoUpdate = Database["public"]["Tables"]["campaign_videos"]["Update"];

async function requireMember(ctx: McpToolContext, campaignId: string): Promise<void> {
  const member = await isCampaignMember(ctx, campaignId);
  if (!member) throw new Error("You are not a member of this campaign.");
}

async function loadVideo(ctx: McpToolContext, videoId: string): Promise<VideoRow> {
  const { data, error } = await ctx.supabase
    .from("campaign_videos")
    .select("*")
    .eq("id", videoId)
    .maybeSingle();
  if (error) fail("Video lookup", error);
  if (!data) throw new Error("Video not found, or you do not have access to it.");
  return data as VideoRow;
}

async function currentIntro(ctx: McpToolContext, campaignId: string): Promise<VideoRow | null> {
  const { data, error } = await ctx.supabase
    .from("campaign_videos")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("video_type", "intro")
    .maybeSingle();
  if (error) fail("Intro lookup", error);
  return (data as VideoRow | null) ?? null;
}

function toStructured(row: VideoRow): Structured {
  return { ...row };
}

/** Inserts the row, replacing the existing intro when a new intro is added. */
async function createVideo(
  ctx: McpToolContext,
  campaignId: string,
  values: Omit<VideoInsert, "campaign_id" | "created_by" | "version">,
  uploadedPaths: string[],
): Promise<VideoRow> {
  const replacing = values.video_type === "intro" ? await currentIntro(ctx, campaignId) : null;
  if (replacing) {
    const { error } = await ctx.supabase.from("campaign_videos").delete().eq("id", replacing.id);
    if (error) {
      for (const path of uploadedPaths)
        await removeStoredObject(ctx.supabase, CAMPAIGN_INTRO_BUCKET, path);
      fail("Replacing the current intro", error);
    }
  }
  const { data, error } = await ctx.supabase
    .from("campaign_videos")
    .insert({
      ...values,
      campaign_id: campaignId,
      created_by: ctx.userId,
      version: crypto.randomUUID(),
    } as VideoInsert)
    .select("*")
    .single();
  if (error) {
    for (const path of uploadedPaths)
      await removeStoredObject(ctx.supabase, CAMPAIGN_INTRO_BUCKET, path);
    fail("Creating video", error);
  }
  if (replacing) {
    await removeStoredObject(ctx.supabase, CAMPAIGN_INTRO_BUCKET, replacing.storage_path);
    if (replacing.thumb_path)
      await removeStoredObject(ctx.supabase, CAMPAIGN_INTRO_BUCKET, replacing.thumb_path);
  }
  return data as VideoRow;
}

async function requireGmForVideo(
  ctx: McpToolContext,
  video: VideoRow,
  reason: string,
): Promise<void> {
  const campaign = await loadCampaign(ctx, video.campaign_id);
  requireGmFor(campaign, reason);
}

export function registerCampaignVideos(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "campaign_videos",
    {
      title: "Campaign videos",
      description:
        "Manage a campaign's MP4 videos (intro, recap, cutscene, trailer, handout, vision, dream, " +
        "other). Actions: list (videos the caller may see), get (read one video), update (change " +
        "title/type/visibility, GM only, changes data), delete (remove the video with its file and " +
        "thumbnail, GM only, deletes data), set_visibility (toggle player visibility, GM only, " +
        "changes data), get_url and get_thumb_url (short-lived signed links), prepare_upload (signed " +
        "upload target for an MP4, GM only), finalize_upload (create the row after uploading, GM " +
        "only, changes data), upload_from_url (disabled for security reasons, use " +
        "prepare_upload/finalize_upload or upload_base64 instead), upload_base64 (create the video from inline base64 bytes, small clips " +
        "only, GM only, changes data), prepare_thumb_upload and set_thumb (replace the thumbnail " +
        "image, GM only, changes data). A campaign has at most one intro video; adding a new intro " +
        "replaces the old one.",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      list: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        await requireMember(ctx, i.campaign_id);
        const limit = i.limit ?? 50;
        let query = ctx.supabase
          .from("campaign_videos")
          .select("*")
          .eq("campaign_id", i.campaign_id)
          .order("created_at", { ascending: false })
          .limit(limit);
        let countQuery = ctx.supabase
          .from("campaign_videos")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", i.campaign_id);
        if (!campaign.isGm) {
          query = query.eq("visible_to_players", true);
          countQuery = countQuery.eq("visible_to_players", true);
        }
        const { data, error } = await query;
        if (error) fail("Listing videos", error);
        const { count, error: countError } = await countQuery;
        if (countError) fail("Counting videos", countError);
        const items = ((data ?? []) as VideoRow[]).map(toStructured);
        return listReply("videos", items, count ?? items.length);
      },

      get: async (i) => {
        const row = await loadVideo(ctx, i.video_id);
        await requireMember(ctx, row.campaign_id);
        return detailReply(`Video "${row.title}".`, toStructured(row));
      },

      update: async (i) => {
        const row = await loadVideo(ctx, i.video_id);
        await requireGmForVideo(ctx, row, "update videos");
        if (i.video_type === "intro" && row.video_type !== "intro") {
          const existing = await currentIntro(ctx, row.campaign_id);
          if (existing) {
            throw new Error(
              "This campaign already has an intro video. Delete it first, then set this one as the intro.",
            );
          }
        }
        const patch = buildPatch({
          title: i.title,
          video_type: i.video_type,
          visible_to_players: i.visible_to_players,
        });
        requirePatch(patch);
        const { data, error } = await ctx.supabase
          .from("campaign_videos")
          .update(patch as VideoUpdate)
          .eq("id", i.video_id)
          .select("*")
          .single();
        if (error) fail("Updating video", error);
        return detailReply(
          `Updated video "${(data as VideoRow).title}".`,
          toStructured(data as VideoRow),
        );
      },

      delete: async (i) => {
        const row = await loadVideo(ctx, i.video_id);
        await requireGmForVideo(ctx, row, "delete videos");
        const { error } = await ctx.supabase.from("campaign_videos").delete().eq("id", i.video_id);
        if (error) fail("Deleting video", error);
        await removeStoredObject(ctx.supabase, CAMPAIGN_INTRO_BUCKET, row.storage_path);
        if (row.thumb_path)
          await removeStoredObject(ctx.supabase, CAMPAIGN_INTRO_BUCKET, row.thumb_path);
        return deleteReply(`Deleted video "${row.title}".`, i.video_id);
      },

      set_visibility: async (i) => {
        const row = await loadVideo(ctx, i.video_id);
        await requireGmForVideo(ctx, row, "change video visibility");
        const { data, error } = await ctx.supabase
          .from("campaign_videos")
          .update({ visible_to_players: i.visible_to_players })
          .eq("id", i.video_id)
          .select("*")
          .single();
        if (error) fail("Updating video visibility", error);
        return detailReply(
          `Video "${(data as VideoRow).title}" is now ${i.visible_to_players ? "visible to" : "hidden from"} players.`,
          toStructured(data as VideoRow),
        );
      },

      get_url: async (i) => {
        const row = await loadVideo(ctx, i.video_id);
        await requireMember(ctx, row.campaign_id);
        const campaign = await loadCampaign(ctx, row.campaign_id);
        if (!campaign.isGm && !row.visible_to_players) {
          throw new Error("This video is not visible to players.");
        }
        const url = await signedReadUrl(ctx.supabase, CAMPAIGN_INTRO_BUCKET, row.storage_path);
        return detailReply(`Signed link for "${row.title}".`, { video_id: row.id, url });
      },

      get_thumb_url: async (i) => {
        const row = await loadVideo(ctx, i.video_id);
        await requireMember(ctx, row.campaign_id);
        const campaign = await loadCampaign(ctx, row.campaign_id);
        if (!campaign.isGm && !row.visible_to_players) {
          throw new Error("This video is not visible to players.");
        }
        if (!row.thumb_path) throw new Error("This video has no thumbnail.");
        const url = await signedReadUrl(ctx.supabase, CAMPAIGN_INTRO_BUCKET, row.thumb_path);
        return detailReply(`Signed thumbnail link for "${row.title}".`, {
          video_id: row.id,
          url,
        });
      },

      prepare_upload: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload videos");
        if (!/\.mp4$/i.test(i.file_name)) throw new Error("Use an MP4 video file.");
        const path = storagePathFor(`${ctx.userId}/${i.campaign_id}`, i.file_name);
        const prepared = await prepareSignedUpload(ctx.supabase, CAMPAIGN_INTRO_BUCKET, path);
        return detailReply("Upload target prepared.", { ...prepared });
      },

      finalize_upload: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload videos");
        const stored = await verifyStoredObject(
          ctx.supabase,
          CAMPAIGN_INTRO_BUCKET,
          i.storage_path,
          { maxBytes: CAMPAIGN_VIDEO_MAX_BYTES, allowedMime: VIDEO_MIME },
        );
        const row = await createVideo(
          ctx,
          i.campaign_id,
          {
            title: i.title,
            video_type: i.video_type,
            storage_path: stored.path,
            file_name: stored.path.split("/").pop() ?? "video.mp4",
            byte_size: stored.size,
            mime_type: "video/mp4",
            visible_to_players: i.visible_to_players ?? true,
          },
          [],
        );
        return detailReply(`Created video "${row.title}".`, toStructured(row));
      },

      // TD-002: disabled — see fetchRemoteFile in uploads.server.ts for why
      // resolve+pin SSRF protection is not achievable on this runtime.
      upload_from_url: async () => {
        throw new Error(
          "Downloading files from a web address is turned off for security reasons. " +
            "Use prepare_upload with finalize_upload instead, or send small clips directly with upload_base64.",
        );
      },

      upload_base64: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload videos");
        const file = decodeBase64File(i.data, "video/mp4", {
          maxBytes: CAMPAIGN_VIDEO_MAX_BYTES,
          allowedMime: VIDEO_MIME,
        });
        const path = storagePathFor(`${ctx.userId}/${i.campaign_id}`, i.file_name);
        await uploadBytes(ctx.supabase, CAMPAIGN_INTRO_BUCKET, path, file);
        const row = await createVideo(
          ctx,
          i.campaign_id,
          {
            title: i.title,
            video_type: i.video_type,
            storage_path: path,
            file_name: i.file_name,
            byte_size: file.size,
            mime_type: "video/mp4",
            visible_to_players: i.visible_to_players ?? true,
          },
          [path],
        );
        return detailReply(`Created video "${row.title}".`, toStructured(row));
      },

      prepare_thumb_upload: async (i) => {
        const video = await loadVideo(ctx, i.video_id);
        await requireGmForVideo(ctx, video, "upload video thumbnails");
        const mime = i.mime_type.toLowerCase();
        if (!THUMB_MIME.includes(mime as (typeof THUMB_MIME)[number])) {
          throw new Error(`Unsupported thumbnail type "${mime}". Use JPEG, PNG or WebP.`);
        }
        const path = storagePathFor(`${ctx.userId}/${video.campaign_id}`, i.file_name);
        const prepared = await prepareSignedUpload(ctx.supabase, CAMPAIGN_INTRO_BUCKET, path);
        return detailReply("Thumbnail upload target prepared.", { ...prepared });
      },

      set_thumb: async (i) => {
        const video = await loadVideo(ctx, i.video_id);
        await requireGmForVideo(ctx, video, "update video thumbnails");
        const sources = [i.storage_path, i.url, i.data].filter(
          (value) => value !== undefined,
        ).length;
        if (sources !== 1) {
          throw new Error("Give exactly one thumbnail source: storage_path, url, or data.");
        }
        let path: string;
        if (i.storage_path) {
          const stored = await verifyStoredObject(
            ctx.supabase,
            CAMPAIGN_INTRO_BUCKET,
            i.storage_path,
            { maxBytes: THUMB_MAX_BYTES, allowedMime: THUMB_MIME },
          );
          path = stored.path;
        } else if (i.url) {
          // TD-002: disabled — see fetchRemoteFile in uploads.server.ts.
          throw new Error(
            "Setting a thumbnail from a web address is turned off for security reasons. " +
              "Use storage_path (prepare_upload/finalize_upload) or send it directly as base64 data.",
          );
        } else {
          if (!i.mime_type) throw new Error("Give mime_type together with base64 thumbnail data.");
          const file = decodeBase64File(i.data ?? "", i.mime_type, {
            maxBytes: THUMB_MAX_BYTES,
            allowedMime: THUMB_MIME,
          });
          path = storagePathFor(`${ctx.userId}/${video.campaign_id}`, i.file_name ?? "thumb.jpg");
          await uploadBytes(ctx.supabase, CAMPAIGN_INTRO_BUCKET, path, file);
        }
        const { data, error } = await ctx.supabase
          .from("campaign_videos")
          .update({ thumb_path: path })
          .eq("id", i.video_id)
          .select("*")
          .single();
        if (error) {
          if (!i.storage_path) await removeStoredObject(ctx.supabase, CAMPAIGN_INTRO_BUCKET, path);
          fail("Updating video thumbnail", error);
        }
        if (video.thumb_path && video.thumb_path !== path) {
          await removeStoredObject(ctx.supabase, CAMPAIGN_INTRO_BUCKET, video.thumb_path);
        }
        return detailReply(
          `Updated the thumbnail for "${(data as VideoRow).title}".`,
          toStructured(data as VideoRow),
        );
      },
    }),
  );
}
