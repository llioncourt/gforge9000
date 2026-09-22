/**
 * Campaign assets: private lore images/PDFs attached to a campaign.
 *
 * Storage layout, bucket name, and the size/MIME allow-list are the same ones
 * the app itself enforces — see `src/lib/assets.ts`.
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
  decodeBase64File,
  fetchRemoteFile,
  prepareSignedUpload,
  removeStoredObject,
  signedReadUrl,
  storagePathFor,
  uploadBytes,
  verifyStoredObject,
} from "@/lib/mcp/uploads.server";

// Source of truth: src/lib/assets.ts
const ASSET_BUCKET = "lore-assets";
const ASSET_MAX_BYTES = 25 * 1024 * 1024;
const ASSET_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "application/pdf",
] as const;

const tagsField = z.array(z.string().max(60)).max(50).optional();

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("list"), campaign_id: uuid, limit: limitField })
    .describe(
      "List a campaign's assets. Members see only assets visible to players; the GM sees all.",
    ),
  z.object({ action: z.literal("get"), asset_id: uuid }).describe("Read one asset's metadata."),
  z
    .object({
      action: z.literal("update"),
      asset_id: uuid,
      title: boundedText(200).optional(),
      caption: z.string().max(2000).nullable().optional(),
      tags: tagsField,
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Update an asset's title, caption, tags, or player visibility. Omitted fields are unchanged. GM only. Changes data.",
    ),
  z
    .object({ action: z.literal("delete"), asset_id: uuid })
    .describe("Delete an asset and its stored file. GM only. Deletes data."),
  z
    .object({
      action: z.literal("set_visibility"),
      asset_id: uuid,
      visible_to_players: z.boolean(),
    })
    .describe("Set whether players can see an asset. GM only. Changes data."),
  z
    .object({ action: z.literal("get_url"), asset_id: uuid })
    .describe("Get a short-lived signed URL to view the asset's stored file."),
  z
    .object({
      action: z.literal("prepare_upload"),
      campaign_id: uuid,
      file_name: boundedText(255),
      mime_type: z.string().max(120),
      byte_size: z.number().int().min(1).max(ASSET_MAX_BYTES),
    })
    .describe(
      "Get a short-lived signed upload target for a new asset file. GM only. Follow with finalize_upload.",
    ),
  z
    .object({
      action: z.literal("finalize_upload"),
      campaign_id: uuid,
      storage_path: boundedText(400),
      title: boundedText(200),
      caption: z.string().max(2000).optional(),
      tags: tagsField,
      visible_to_players: z.boolean().optional(),
      width: z.number().int().min(1).max(20000).optional(),
      height: z.number().int().min(1).max(20000).optional(),
    })
    .describe(
      "Create the asset row after the file was written to the path from prepare_upload. GM only. Changes data.",
    ),
  z
    .object({
      action: z.literal("upload_from_url"),
      campaign_id: uuid,
      url: z.string().max(2000),
      title: boundedText(200),
      caption: z.string().max(2000).optional(),
      tags: tagsField,
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Disabled for security reasons: use prepare_upload + finalize_upload, or upload_base64 for small files.",
    ),
  z
    .object({
      action: z.literal("upload_base64"),
      campaign_id: uuid,
      data: z.string().max(12_000_000),
      mime_type: z.string().max(120),
      file_name: boundedText(255),
      title: boundedText(200),
      caption: z.string().max(2000).optional(),
      tags: tagsField,
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Create the asset from base64-encoded bytes (small files only). GM only. Changes data.",
    ),
]);

interface AssetRow {
  id: string;
  campaign_id: string;
  title: string;
  caption: string | null;
  tags: string[];
  storage_path: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  visible_to_players: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

async function requireMember(ctx: McpToolContext, campaignId: string): Promise<void> {
  const member = await isCampaignMember(ctx, campaignId);
  if (!member) throw new Error("You are not a member of this campaign.");
}

async function loadAsset(ctx: McpToolContext, assetId: string): Promise<AssetRow> {
  const { data, error } = await ctx.supabase
    .from("campaign_assets")
    .select("*")
    .eq("id", assetId)
    .maybeSingle();
  if (error) fail("Asset lookup", error);
  if (!data) throw new Error("Asset not found, or you do not have access to it.");
  return data as AssetRow;
}

function toStructured(row: AssetRow): Structured {
  return { ...row };
}

export function registerCampaignAssets(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "campaign_assets",
    {
      title: "Campaign assets",
      description:
        "Manage a campaign's private lore images and PDFs. Actions: list (read assets visible to " +
        "the caller), get (read one asset), update (change title/caption/tags/visibility, GM only, " +
        "changes data), delete (remove the asset and its stored file, GM only, deletes data), " +
        "set_visibility (toggle player visibility, GM only, changes data), get_url (short-lived " +
        "signed view URL), prepare_upload (get a signed upload target, GM only), finalize_upload " +
        "(create the asset row after uploading, GM only, changes data), upload_from_url (disabled for " +
        "security reasons, use prepare_upload/finalize_upload or upload_base64 instead), upload_base64 (create the " +
        "asset from inline base64 bytes, small files only, GM only, changes data).",
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
          .from("campaign_assets")
          .select("*")
          .eq("campaign_id", i.campaign_id)
          .order("created_at", { ascending: false })
          .limit(limit);
        let countQuery = ctx.supabase
          .from("campaign_assets")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", i.campaign_id);
        if (!campaign.isGm) {
          query = query.eq("visible_to_players", true);
          countQuery = countQuery.eq("visible_to_players", true);
        }
        const { data, error } = await query;
        if (error) fail("Listing assets", error);
        const { count, error: countError } = await countQuery;
        if (countError) fail("Counting assets", countError);
        const items = ((data ?? []) as AssetRow[]).map(toStructured);
        return listReply("assets", items, count ?? items.length);
      },

      get: async (i) => {
        const row = await loadAsset(ctx, i.asset_id);
        await requireMember(ctx, row.campaign_id);
        return detailReply(`Asset "${row.title}".`, toStructured(row));
      },

      update: async (i) => {
        const row = await loadAsset(ctx, i.asset_id);
        const campaign = await loadCampaign(ctx, row.campaign_id);
        requireGmFor(campaign, "update assets");
        const patch = buildPatch({
          title: i.title,
          caption: i.caption,
          tags: i.tags,
          visible_to_players: i.visible_to_players,
        });
        requirePatch(patch);
        const { data, error } = await ctx.supabase
          .from("campaign_assets")
          .update(patch as Database["public"]["Tables"]["campaign_assets"]["Update"])
          .eq("id", i.asset_id)
          .select("*")
          .single();
        if (error) fail("Updating asset", error);
        return detailReply(
          `Updated asset "${(data as AssetRow).title}".`,
          toStructured(data as AssetRow),
        );
      },

      delete: async (i) => {
        const row = await loadAsset(ctx, i.asset_id);
        const campaign = await loadCampaign(ctx, row.campaign_id);
        requireGmFor(campaign, "delete assets");
        const { error } = await ctx.supabase.from("campaign_assets").delete().eq("id", i.asset_id);
        if (error) fail("Deleting asset", error);
        await removeStoredObject(ctx.supabase, ASSET_BUCKET, row.storage_path);
        return deleteReply(`Deleted asset "${row.title}".`, i.asset_id);
      },

      set_visibility: async (i) => {
        const row = await loadAsset(ctx, i.asset_id);
        const campaign = await loadCampaign(ctx, row.campaign_id);
        requireGmFor(campaign, "change asset visibility");
        const { data, error } = await ctx.supabase
          .from("campaign_assets")
          .update({ visible_to_players: i.visible_to_players })
          .eq("id", i.asset_id)
          .select("*")
          .single();
        if (error) fail("Updating asset visibility", error);
        return detailReply(
          `Asset "${(data as AssetRow).title}" is now ${i.visible_to_players ? "visible to" : "hidden from"} players.`,
          toStructured(data as AssetRow),
        );
      },

      get_url: async (i) => {
        const row = await loadAsset(ctx, i.asset_id);
        await requireMember(ctx, row.campaign_id);
        const campaign = await loadCampaign(ctx, row.campaign_id);
        if (!campaign.isGm && !row.visible_to_players) {
          throw new Error("This asset is not visible to players.");
        }
        const url = await signedReadUrl(ctx.supabase, ASSET_BUCKET, row.storage_path);
        return detailReply(`Signed link for "${row.title}".`, { asset_id: row.id, url });
      },

      prepare_upload: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload assets");
        if (i.byte_size > ASSET_MAX_BYTES) throw new Error("That file is too large.");
        const type = i.mime_type.toLowerCase();
        if (!ASSET_TYPES.includes(type as (typeof ASSET_TYPES)[number])) {
          throw new Error(`Unsupported file type "${type}".`);
        }
        const path = storagePathFor(`${ctx.userId}/${i.campaign_id}`, i.file_name);
        const prepared = await prepareSignedUpload(ctx.supabase, ASSET_BUCKET, path);
        return detailReply("Upload target prepared.", { ...prepared });
      },

      finalize_upload: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload assets");
        const stored = await verifyStoredObject(ctx.supabase, ASSET_BUCKET, i.storage_path, {
          maxBytes: ASSET_MAX_BYTES,
          allowedMime: ASSET_TYPES,
        });
        const { data, error } = await ctx.supabase
          .from("campaign_assets")
          .insert({
            campaign_id: i.campaign_id,
            title: i.title,
            caption: i.caption ?? null,
            tags: i.tags ?? [],
            storage_path: stored.path,
            mime_type: stored.mime,
            byte_size: stored.size,
            width: i.width ?? null,
            height: i.height ?? null,
            visible_to_players: i.visible_to_players ?? false,
            created_by: ctx.userId,
          })
          .select("*")
          .single();
        if (error) fail("Creating asset", error);
        return detailReply(
          `Created asset "${(data as AssetRow).title}".`,
          toStructured(data as AssetRow),
        );
      },

      // TD-002: disabled — see fetchRemoteFile in uploads.server.ts for why
      // resolve+pin SSRF protection is not achievable on this runtime.
      upload_from_url: async () => {
        throw new Error(
          "Downloading files from a web address is turned off for security reasons. " +
            "Use prepare_upload with finalize_upload instead, or send small files directly with upload_base64.",
        );
      },

      upload_base64: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "upload assets");
        const file = decodeBase64File(i.data, i.mime_type, {
          maxBytes: ASSET_MAX_BYTES,
          allowedMime: ASSET_TYPES,
        });
        const path = storagePathFor(`${ctx.userId}/${i.campaign_id}`, i.file_name);
        await uploadBytes(ctx.supabase, ASSET_BUCKET, path, file);
        const { data, error } = await ctx.supabase
          .from("campaign_assets")
          .insert({
            campaign_id: i.campaign_id,
            title: i.title,
            caption: i.caption ?? null,
            tags: i.tags ?? [],
            storage_path: path,
            mime_type: file.mime,
            byte_size: file.size,
            visible_to_players: i.visible_to_players ?? false,
            created_by: ctx.userId,
          })
          .select("*")
          .single();
        if (error) fail("Creating asset", error);
        return detailReply(
          `Created asset "${(data as AssetRow).title}".`,
          toStructured(data as AssetRow),
        );
      },
    }),
  );
}
