/**
 * Battlemaps: map records, their fog/grid settings, tokens (map objects) and
 * the map image itself.
 *
 * Constants and validators are copied from `src/lib/battlemap.ts` rather than
 * imported, because that module imports the browser Supabase client
 * (`@/integrations/supabase/client`) at module scope, which is unsafe here.
 */

import { z } from "zod/v4";
import {
  CREATE,
  DESTROY,
  MODIFY,
  READ,
  actionRouter,
  anyDb,
  boundedText,
  buildPatch,
  deleteReply,
  detailReply,
  domainOutput,
  fail,
  intField,
  isCampaignMember,
  jsonRecord,
  limitField,
  listReply,
  loadCampaign,
  requireGmFor,
  requirePatch,
  uuid,
} from "@/lib/mcp/kit.server";
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

// Source: src/lib/battlemap.ts (not imported — it pulls in the browser client).
const MAP_BUCKET = "maps";
const MAP_MAX_BYTES = 25 * 1024 * 1024;
const MAP_TYPES = ["image/png", "image/jpeg", "image/webp", "image/avif"] as const;

const gridType = z.enum(["square", "hex", "none"]);

const mapEditable = {
  name: boundedText(200).optional(),
  grid_type: gridType.optional(),
  grid_size: intField(1, 4096, "grid_size").optional(),
  grid_offset_x: z.number().finite().optional(),
  grid_offset_y: z.number().finite().optional(),
  unit_per_cell: z.number().positive().finite().optional(),
  unit_name: boundedText(20).optional(),
  visible_to_players: z.boolean().optional(),
  data: jsonRecord.optional(),
};

const objectEditable = {
  kind: boundedText(50).optional(),
  label: boundedText(200).optional(),
  character_id: uuid.nullable().optional(),
  owner_user_id: uuid.nullable().optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  size: z.number().positive().finite().optional(),
  rotation: z.number().finite().optional(),
  color: boundedText(20).nullable().optional(),
  image_url: boundedText(2000).nullable().optional(),
  hidden: z.boolean().optional(),
  data: jsonRecord.optional(),
};

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("list"), campaign_id: uuid, limit: limitField })
    .describe("List a campaign's maps. Players never see maps with visible_to_players = false."),
  z.object({ action: z.literal("get"), map_id: uuid }).describe("Read one map by id."),
  z
    .object({ action: z.literal("create"), campaign_id: uuid, ...mapEditable })
    .describe("Create a new map in a campaign. Changes data. GM only."),
  z
    .object({
      action: z.literal("update"),
      map_id: uuid,
      ...mapEditable,
      fog: jsonRecord.optional(),
      is_active: z.boolean().optional(),
    })
    .describe("Update a map's settings, fog, or active state. Changes data. GM only."),
  z
    .object({ action: z.literal("delete"), map_id: uuid })
    .describe("Delete a map and its stored image. Deletes data. GM only."),
  z
    .object({ action: z.literal("list_objects"), map_id: uuid, limit: limitField })
    .describe(
      "List a map's tokens/objects. Players never see hidden objects unless they own the " +
        "object or the character it represents.",
    ),
  z
    .object({ action: z.literal("create_object"), map_id: uuid, ...objectEditable })
    .describe("Add a token/object to a map. Changes data. GM only."),
  z
    .object({ action: z.literal("update_object"), object_id: uuid, ...objectEditable })
    .describe(
      "Update a token/object. GM may update anything on a map they run. A player may only " +
        "update a non-hidden object on a map they can view, and only when it is theirs " +
        "(owner_user_id matches them, or it is tied to a character they own). Changes data.",
    ),
  z
    .object({ action: z.literal("delete_object"), object_id: uuid })
    .describe("Delete a token/object from a map. Deletes data. GM only."),
  z
    .object({
      action: z.literal("prepare_upload"),
      map_id: uuid,
      file_name: boundedText(200),
      mime_type: z.enum(MAP_TYPES),
      byte_size: intField(1, MAP_MAX_BYTES, "byte_size"),
    })
    .describe(
      "Get a short-lived signed target to upload a map image directly. Follow with " +
        "finalize_image_upload. GM only.",
    ),
  z
    .object({
      action: z.literal("finalize_image_upload"),
      map_id: uuid,
      storage_path: boundedText(500),
      image_width: intField(1, 20000, "image_width").optional(),
      image_height: intField(1, 20000, "image_height").optional(),
    })
    .describe("Confirm an uploaded map image and attach it to the map. Changes data. GM only."),
  z
    .object({ action: z.literal("upload_image_from_url"), map_id: uuid, url: boundedText(2000) })
    .describe(
      "Disabled for security reasons: use prepare_upload + finalize_image_upload, or upload_image_base64.",
    ),
  z
    .object({
      action: z.literal("upload_image_base64"),
      map_id: uuid,
      data: z.string().min(1),
      mime_type: z.enum(MAP_TYPES),
      file_name: boundedText(200),
    })
    .describe("Attach a small map image sent inline as base64. Changes data. GM only."),
]);

interface MapRow {
  id: string;
  campaign_id: string;
  name: string;
  visible_to_players: boolean;
  image_path: string | null;
  [key: string]: unknown;
}

interface MapObjectRow {
  id: string;
  map_id: string;
  campaign_id: string;
  hidden: boolean;
  owner_user_id: string | null;
  character_id: string | null;
  [key: string]: unknown;
}

interface MapAccess {
  map: MapRow;
  campaignId: string;
  campaignName: string;
  isGm: boolean;
}

async function loadMap(ctx: McpToolContext, mapId: string): Promise<MapAccess> {
  const { data, error } = await anyDb(ctx.supabase)
    .from("maps")
    .select("*")
    .eq("id", mapId)
    .maybeSingle();
  if (error) fail("Map lookup", error);
  if (!data) throw new Error("Map not found, or you do not have access to it.");
  const map = data as MapRow;
  const campaign = await loadCampaign(ctx, map.campaign_id);
  if (!campaign.isGm) {
    const member = await isCampaignMember(ctx, map.campaign_id);
    if (!member) throw new Error("Map not found, or you do not have access to it.");
  }
  return { map, campaignId: campaign.id, campaignName: campaign.name, isGm: campaign.isGm };
}

function requireMapVisible(access: MapAccess): void {
  if (!access.isGm && !access.map.visible_to_players) {
    throw new Error("Map not found, or you do not have access to it.");
  }
}

async function ownedCharacterIds(ctx: McpToolContext): Promise<Set<string>> {
  const { data, error } = await ctx.supabase
    .from("characters")
    .select("id")
    .eq("owner_id", ctx.userId);
  if (error) fail("Character lookup", error);
  return new Set((data ?? []).map((row) => row.id));
}

async function loadObject(
  ctx: McpToolContext,
  objectId: string,
): Promise<{ object: MapObjectRow; map: MapAccess }> {
  const { data, error } = await anyDb(ctx.supabase)
    .from("map_objects")
    .select("*")
    .eq("id", objectId)
    .maybeSingle();
  if (error) fail("Map object lookup", error);
  if (!data) throw new Error("Map object not found, or you do not have access to it.");
  const object = data as MapObjectRow;
  const map = await loadMap(ctx, object.map_id);
  return { object, map };
}

async function requirePlayerCanEditObject(
  ctx: McpToolContext,
  object: MapObjectRow,
  map: MapAccess,
): Promise<void> {
  if (map.isGm) return;
  requireMapVisible(map);
  if (object.hidden) throw new Error("Only the Game Master can change a hidden object.");
  if (object.owner_user_id === ctx.userId) return;
  if (object.character_id) {
    const owned = await ownedCharacterIds(ctx);
    if (owned.has(object.character_id)) return;
  }
  throw new Error("You can only change tokens that belong to you or your character.");
}

async function mapImageView(map: MapRow): Promise<Structured> {
  return { ...map };
}

async function afterImageAttach(
  ctx: McpToolContext,
  access: MapAccess,
  storagePath: string,
  dims: { image_width?: number | undefined; image_height?: number | undefined },
): Promise<Structured> {
  const previous = access.map.image_path;
  const patch = buildPatch({
    image_path: storagePath,
    image_width: dims.image_width,
    image_height: dims.image_height,
  });
  const { data, error } = await anyDb(ctx.supabase)
    .from("maps")
    .update(patch)
    .eq("id", access.map.id)
    .select("*")
    .single();
  if (error) fail("Attaching map image", error);
  if (previous && previous !== storagePath)
    await removeStoredObject(ctx.supabase, MAP_BUCKET, previous);
  return data as Structured;
}

export function registerMaps(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "maps",
    {
      title: "Battlemaps",
      description:
        "Manage a campaign's battlemaps, tokens, and map images. Actions: list (read maps, " +
        "hidden ones excluded for players), get (read one map), create (add a map, changes data, " +
        "GM only), update (change grid/fog/visibility/active state, changes data, GM only), " +
        "delete (remove a map and its image, deletes data, GM only), list_objects (read a map's " +
        "tokens, hidden ones excluded unless yours), create_object (add a token, changes data, GM " +
        "only), update_object (change a token, changes data, GM may change any token, a player " +
        "only their own non-hidden token), delete_object (remove a token, deletes data, GM only), " +
        "prepare_upload/finalize_image_upload/upload_image_base64 (attach a map image, changes " +
        "data, GM only; upload_image_from_url is disabled for security reasons).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      list: async (i) => {
        const member = await isCampaignMember(ctx, i.campaign_id);
        const campaign = await loadCampaign(ctx, i.campaign_id);
        if (!member && !campaign.isGm) throw new Error("You are not a member of this campaign.");
        const limit = i.limit ?? 50;
        let query = anyDb(ctx.supabase)
          .from("maps")
          .select("*")
          .eq("campaign_id", i.campaign_id)
          .order("created_at", { ascending: true })
          .limit(limit);
        if (!campaign.isGm) query = query.eq("visible_to_players", true);
        const { data, error } = await query;
        if (error) fail("Listing maps", error);

        let countQuery = anyDb(ctx.supabase)
          .from("maps")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", i.campaign_id);
        if (!campaign.isGm) countQuery = countQuery.eq("visible_to_players", true);
        const { count, error: countError } = await countQuery;
        if (countError) fail("Counting maps", countError);

        return listReply("maps", (data ?? []) as Structured[], count ?? (data ?? []).length);
      },

      get: async (i) => {
        const access = await loadMap(ctx, i.map_id);
        requireMapVisible(access);
        return detailReply(`Map "${access.map.name}".`, await mapImageView(access.map));
      },

      create: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "create maps");
        const insert = buildPatch({
          campaign_id: i.campaign_id,
          created_by: ctx.userId,
          name: i.name,
          grid_type: i.grid_type,
          grid_size: i.grid_size,
          grid_offset_x: i.grid_offset_x,
          grid_offset_y: i.grid_offset_y,
          unit_per_cell: i.unit_per_cell,
          unit_name: i.unit_name,
          visible_to_players: i.visible_to_players,
          data: i.data,
        });
        const { data, error } = await anyDb(ctx.supabase)
          .from("maps")
          .insert(insert)
          .select("*")
          .single();
        if (error) fail("Creating map", error);
        return detailReply(`Created map "${(data as MapRow).name}".`, data as Structured);
      },

      update: async (i) => {
        const access = await loadMap(ctx, i.map_id);
        const campaign = await loadCampaign(ctx, access.campaignId);
        requireGmFor(campaign, "update maps");
        const patch = buildPatch({
          name: i.name,
          grid_type: i.grid_type,
          grid_size: i.grid_size,
          grid_offset_x: i.grid_offset_x,
          grid_offset_y: i.grid_offset_y,
          unit_per_cell: i.unit_per_cell,
          unit_name: i.unit_name,
          visible_to_players: i.visible_to_players,
          data: i.data,
          fog: i.fog,
          is_active: i.is_active,
        });
        requirePatch(patch);
        const { data, error } = await anyDb(ctx.supabase)
          .from("maps")
          .update(patch)
          .eq("id", i.map_id)
          .select("*")
          .single();
        if (error) fail("Updating map", error);
        return detailReply(`Updated map "${(data as MapRow).name}".`, data as Structured);
      },

      delete: async (i) => {
        const access = await loadMap(ctx, i.map_id);
        const campaign = await loadCampaign(ctx, access.campaignId);
        requireGmFor(campaign, "delete maps");
        if (access.map.image_path)
          await removeStoredObject(ctx.supabase, MAP_BUCKET, access.map.image_path);
        const { error } = await anyDb(ctx.supabase).from("maps").delete().eq("id", i.map_id);
        if (error) fail("Deleting map", error);
        return deleteReply(`Deleted map "${access.map.name}".`, i.map_id);
      },

      list_objects: async (i) => {
        const access = await loadMap(ctx, i.map_id);
        requireMapVisible(access);
        const limit = i.limit ?? 50;
        const { data, error } = await anyDb(ctx.supabase)
          .from("map_objects")
          .select("*")
          .eq("map_id", i.map_id)
          .order("created_at", { ascending: true })
          .limit(limit * 2); // headroom for the visibility filter below
        if (error) fail("Listing map objects", error);
        let rows = (data ?? []) as MapObjectRow[];
        if (!access.isGm) {
          const owned = await ownedCharacterIds(ctx);
          rows = rows.filter(
            (row) =>
              !row.hidden ||
              row.owner_user_id === ctx.userId ||
              (row.character_id ? owned.has(row.character_id) : false),
          );
        }
        rows = rows.slice(0, limit);

        const countQuery = anyDb(ctx.supabase)
          .from("map_objects")
          .select("id", { count: "exact", head: true })
          .eq("map_id", i.map_id);
        if (access.isGm) {
          const { count, error: countError } = await countQuery;
          if (countError) fail("Counting map objects", countError);
          return listReply("map objects", rows as Structured[], count ?? rows.length);
        }
        // Players: no exact-count RPC for the visibility-filtered rows exists,
        // so the count is the same filtered set actually returned this call.
        return listReply("map objects", rows as Structured[], rows.length);
      },

      create_object: async (i) => {
        const access = await loadMap(ctx, i.map_id);
        const campaign = await loadCampaign(ctx, access.campaignId);
        requireGmFor(campaign, "add map tokens");
        const insert = buildPatch({
          map_id: i.map_id,
          campaign_id: access.campaignId,
          created_by: ctx.userId,
          kind: i.kind,
          label: i.label,
          character_id: i.character_id,
          owner_user_id: i.owner_user_id,
          x: i.x,
          y: i.y,
          size: i.size,
          rotation: i.rotation,
          color: i.color,
          image_url: i.image_url,
          hidden: i.hidden,
          data: i.data,
        });
        const { data, error } = await anyDb(ctx.supabase)
          .from("map_objects")
          .insert(insert)
          .select("*")
          .single();
        if (error) fail("Creating map object", error);
        return detailReply(`Added token "${(data as MapObjectRow)["label"]}".`, data as Structured);
      },

      update_object: async (i) => {
        const { object, map } = await loadObject(ctx, i.object_id);
        await requirePlayerCanEditObject(ctx, object, map);
        const patch = buildPatch({
          kind: i.kind,
          label: i.label,
          character_id: i.character_id,
          owner_user_id: i.owner_user_id,
          x: i.x,
          y: i.y,
          size: i.size,
          rotation: i.rotation,
          color: i.color,
          image_url: i.image_url,
          hidden: i.hidden,
          data: i.data,
        });
        requirePatch(patch);
        // A player may never re-hide/re-own a token as a way around the checks above.
        if (!map.isGm && ("hidden" in patch || "owner_user_id" in patch)) {
          throw new Error("Only the Game Master can change a token's hidden state or owner.");
        }
        const { data, error } = await anyDb(ctx.supabase)
          .from("map_objects")
          .update(patch)
          .eq("id", i.object_id)
          .select("*")
          .single();
        if (error) fail("Updating map object", error);
        return detailReply(
          `Updated token "${(data as MapObjectRow)["label"]}".`,
          data as Structured,
        );
      },

      delete_object: async (i) => {
        const { object, map } = await loadObject(ctx, i.object_id);
        const campaign = await loadCampaign(ctx, map.campaignId);
        requireGmFor(campaign, "delete map tokens");
        const { error } = await anyDb(ctx.supabase)
          .from("map_objects")
          .delete()
          .eq("id", i.object_id);
        if (error) fail("Deleting map object", error);
        return deleteReply(`Deleted token "${object["label"]}".`, i.object_id);
      },

      prepare_upload: async (i) => {
        const access = await loadMap(ctx, i.map_id);
        const campaign = await loadCampaign(ctx, access.campaignId);
        requireGmFor(campaign, "upload map images");
        if (i.byte_size > MAP_MAX_BYTES) {
          throw new Error(`byte_size must be at most ${MAP_MAX_BYTES} bytes.`);
        }
        const path = storagePathFor(`${ctx.userId}/${access.campaignId}`, i.file_name);
        const prepared = await prepareSignedUpload(ctx.supabase, MAP_BUCKET, path);
        return detailReply(`Upload target ready for map "${access.map.name}".`, { ...prepared });
      },

      finalize_image_upload: async (i) => {
        const access = await loadMap(ctx, i.map_id);
        const campaign = await loadCampaign(ctx, access.campaignId);
        requireGmFor(campaign, "upload map images");
        const stored = await verifyStoredObject(ctx.supabase, MAP_BUCKET, i.storage_path, {
          maxBytes: MAP_MAX_BYTES,
          allowedMime: MAP_TYPES,
        });
        const item = await afterImageAttach(ctx, access, stored.path, {
          image_width: i.image_width,
          image_height: i.image_height,
        });
        return detailReply(`Map image attached to "${access.map.name}".`, item);
      },

      // TD-002: disabled — see fetchRemoteFile in uploads.server.ts for why
      // resolve+pin SSRF protection is not achievable on this runtime.
      upload_image_from_url: async () => {
        throw new Error(
          "Downloading files from a web address is turned off for security reasons. " +
            "Use prepare_upload with finalize_image_upload instead, or upload_image_base64 for small files.",
        );
      },

      upload_image_base64: async (i) => {
        const access = await loadMap(ctx, i.map_id);
        const campaign = await loadCampaign(ctx, access.campaignId);
        requireGmFor(campaign, "upload map images");
        const file = decodeBase64File(i.data, i.mime_type, {
          maxBytes: MAP_MAX_BYTES,
          allowedMime: MAP_TYPES,
        });
        const path = storagePathFor(`${ctx.userId}/${access.campaignId}`, i.file_name);
        await uploadBytes(ctx.supabase, MAP_BUCKET, path, file);
        const item = await afterImageAttach(ctx, access, path, {});
        return detailReply(`Map image attached to "${access.map.name}".`, item);
      },
    }),
  );
}
