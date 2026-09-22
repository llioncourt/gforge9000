/**
 * Character portrait: the single stored image on a character sheet.
 *
 * Storage layout, bucket name, and the size/MIME allow-list are the same ones
 * the app itself enforces — see `src/lib/portrait.ts`.
 */

import { z } from "zod/v4";
import {
  actionRouter,
  boundedText,
  detailReply,
  domainOutput,
  fail,
  loadCharacter,
  requireCharacterWrite,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";
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

// Source of truth: src/lib/portrait.ts
const PORTRAIT_BUCKET = "portraits";
const PORTRAIT_MAX_BYTES = 5 * 1024 * 1024;
const PORTRAIT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("get"), character_id: uuid })
    .describe(
      "Read a character's portrait path and a short-lived signed view URL, or null if none.",
    ),
  z
    .object({ action: z.literal("clear"), character_id: uuid })
    .describe(
      "Remove the character's portrait, clearing the stored path and deleting the file if this app owns it. Owner or campaign GM only. Deletes data.",
    ),
  z
    .object({
      action: z.literal("prepare_upload"),
      character_id: uuid,
      file_name: boundedText(255),
      mime_type: z.string().max(120),
      byte_size: z.number().int().min(1).max(PORTRAIT_MAX_BYTES),
    })
    .describe(
      "Get a short-lived signed upload target for a new portrait. Owner or campaign GM only. Follow with finalize_upload.",
    ),
  z
    .object({
      action: z.literal("finalize_upload"),
      character_id: uuid,
      storage_path: boundedText(400),
    })
    .describe(
      "Set the character's portrait after the file was written to the path from prepare_upload. Owner or campaign GM only. Changes data.",
    ),
  z
    .object({ action: z.literal("upload_from_url"), character_id: uuid, url: z.string().max(2000) })
    .describe(
      "Download an image from a public https URL and set it as the portrait. Owner or campaign GM only. Changes data.",
    ),
  z
    .object({
      action: z.literal("upload_base64"),
      character_id: uuid,
      data: z.string().max(12_000_000),
      mime_type: z.string().max(120),
      file_name: boundedText(255),
    })
    .describe(
      "Set the portrait from base64-encoded bytes (small files only). Owner or campaign GM only. Changes data.",
    ),
]);

/** True only for paths this app itself wrote, so a foreign path is never deleted. */
function ownsPortraitPath(path: string | null | undefined): path is string {
  return typeof path === "string" && path.length > 0 && !/^https?:\/\//i.test(path);
}

async function replacePortrait(
  ctx: McpToolContext,
  characterId: string,
  newPath: string,
): Promise<ReturnType<typeof detailReply>> {
  const access = await loadCharacter(ctx, characterId);
  requireCharacterWrite(access);
  const previous = access.row.portrait_path;
  const { data, error } = await ctx.supabase
    .from("characters")
    .update({ portrait_path: newPath })
    .eq("id", characterId)
    .select("id, name, portrait_path")
    .single();
  if (error) fail("Updating portrait", error);
  if (ownsPortraitPath(previous) && previous !== newPath) {
    await removeStoredObject(ctx.supabase, PORTRAIT_BUCKET, previous);
  }
  const url = await signedReadUrl(ctx.supabase, PORTRAIT_BUCKET, newPath);
  return detailReply(`Portrait updated for "${data.name}".`, {
    character_id: data.id,
    portrait_path: data.portrait_path,
    url,
  });
}

export function registerCharacterPortrait(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "character_portrait",
    {
      title: "Character portrait",
      description:
        "Manage a character sheet's single portrait image. Actions: get (read the portrait path " +
        "and a short-lived signed view URL, or null if none), clear (remove the portrait, owner or " +
        "campaign GM only, deletes data), prepare_upload (get a signed upload target, owner or " +
        "campaign GM only), finalize_upload (set the portrait after uploading, owner or campaign GM " +
        "only, changes data), upload_from_url (fetch a public https image and set it as the " +
        "portrait, owner or campaign GM only, changes data), upload_base64 (set the portrait from " +
        "inline base64 bytes, small files only, owner or campaign GM only, changes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      get: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        const path = access.row.portrait_path;
        const url = ownsPortraitPath(path)
          ? await signedReadUrl(ctx.supabase, PORTRAIT_BUCKET, path)
          : null;
        return detailReply(`Portrait for "${access.row.name}".`, {
          character_id: access.row.id,
          portrait_path: path,
          url,
        });
      },

      clear: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        requireCharacterWrite(access);
        const previous = access.row.portrait_path;
        const { data, error } = await ctx.supabase
          .from("characters")
          .update({ portrait_path: null })
          .eq("id", i.character_id)
          .select("id, name")
          .single();
        if (error) fail("Clearing portrait", error);
        if (ownsPortraitPath(previous)) {
          await removeStoredObject(ctx.supabase, PORTRAIT_BUCKET, previous);
        }
        return detailReply(`Portrait cleared for "${data.name}".`, {
          character_id: data.id,
          portrait_path: null,
          url: null,
        });
      },

      prepare_upload: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        requireCharacterWrite(access);
        if (i.byte_size > PORTRAIT_MAX_BYTES) throw new Error("That file is too large.");
        const type = i.mime_type.toLowerCase();
        if (!PORTRAIT_TYPES.includes(type as (typeof PORTRAIT_TYPES)[number])) {
          throw new Error(`Unsupported file type "${type}".`);
        }
        const path = storagePathFor(`${ctx.userId}/${i.character_id}`, i.file_name);
        const prepared = await prepareSignedUpload(ctx.supabase, PORTRAIT_BUCKET, path);
        return detailReply("Upload target prepared.", { ...prepared });
      },

      finalize_upload: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        requireCharacterWrite(access);
        const stored = await verifyStoredObject(ctx.supabase, PORTRAIT_BUCKET, i.storage_path, {
          maxBytes: PORTRAIT_MAX_BYTES,
          allowedMime: PORTRAIT_TYPES,
        });
        return replacePortrait(ctx, i.character_id, stored.path);
      },

      upload_from_url: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        requireCharacterWrite(access);
        const file = await fetchRemoteFile(i.url, {
          maxBytes: PORTRAIT_MAX_BYTES,
          allowedMime: PORTRAIT_TYPES,
        });
        const fileName = new URL(i.url).pathname.split("/").pop() ?? "portrait";
        const path = storagePathFor(`${ctx.userId}/${i.character_id}`, fileName);
        await uploadBytes(ctx.supabase, PORTRAIT_BUCKET, path, file);
        return replacePortrait(ctx, i.character_id, path);
      },

      upload_base64: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        requireCharacterWrite(access);
        const file = decodeBase64File(i.data, i.mime_type, {
          maxBytes: PORTRAIT_MAX_BYTES,
          allowedMime: PORTRAIT_TYPES,
        });
        const path = storagePathFor(`${ctx.userId}/${i.character_id}`, i.file_name);
        await uploadBytes(ctx.supabase, PORTRAIT_BUCKET, path, file);
        return replacePortrait(ctx, i.character_id, path);
      },
    }),
  );
}
