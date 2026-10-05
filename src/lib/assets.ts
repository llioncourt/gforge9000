import { supabase } from "@/integrations/supabase/client";
import { currentUser } from "@/lib/current-user";
import { cachedSignedUrl } from "@/lib/signed-url-cache";
import { batchedSignedUrl } from "@/lib/signed-url-batch";
import { toAvifIfImage } from "@/lib/image-avif";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type AssetRow = Tables<"campaign_assets">;

export const ASSET_BUCKET = "lore-assets";
export const ASSET_MAX_BYTES = 25 * 1024 * 1024;
export const ASSET_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "application/pdf",
];

export function validateAssetFile(file: {
  type: string;
  size: number;
  name: string;
}): string | null {
  const type = (file.type || "").toLowerCase();
  const byExtension = /\.(png|jpe?g|webp|avif|gif|pdf)$/i.test(file.name);
  if (!ASSET_TYPES.includes(type) && !byExtension) {
    return "Use a PNG, JPEG, WebP, AVIF, GIF or PDF file.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > ASSET_MAX_BYTES) {
    return `File is too large (max ${Math.round(ASSET_MAX_BYTES / 1024 / 1024)} MB).`;
  }
  return null;
}

/** Assets live under `<user id>/<campaign id>/…`, which is what storage RLS checks. */
export function assetPathFor(userId: string, campaignId: string, fileName: string) {
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName)?.[1] ?? "png").toLowerCase();
  return `${userId}/${campaignId}/${crypto.randomUUID()}.${ext === "jpeg" ? "jpg" : ext}`;
}

export function isImageAsset(row: { mime_type: string; storage_path: string }): boolean {
  return (
    row.mime_type.startsWith("image/") || /\.(png|jpe?g|webp|avif|gif)$/i.test(row.storage_path)
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

export async function listAssets(campaignId: string): Promise<AssetRow[]> {
  return unwrap(
    await supabase
      .from("campaign_assets")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
  );
}

export async function uploadAssetFile(
  campaignId: string,
  file: File,
): Promise<{ path: string; mimeType: string; byteSize: number }> {
  const { data: auth } = await currentUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");
  const stored = await toAvifIfImage(file);
  const path = assetPathFor(user.id, campaignId, stored.name);
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, stored, {
    contentType: stored.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { path, mimeType: stored.type || "application/octet-stream", byteSize: stored.size };
}

export async function createAsset(input: TablesInsert<"campaign_assets">): Promise<AssetRow> {
  return unwrap(await supabase.from("campaign_assets").insert(input).select("*").single());
}

export async function updateAsset(
  id: string,
  patch: TablesUpdate<"campaign_assets">,
): Promise<AssetRow> {
  return unwrap(
    await supabase.from("campaign_assets").update(patch).eq("id", id).select("*").single(),
  );
}

export async function deleteAsset(row: AssetRow): Promise<void> {
  const { error } = await supabase.from("campaign_assets").delete().eq("id", row.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(ASSET_BUCKET).remove([row.storage_path]);
}

/** Signed URL for a private asset, valid for 8 hours. */
export async function assetUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return cachedSignedUrl(ASSET_BUCKET, path, () =>
    batchedSignedUrl(ASSET_BUCKET, path, 60 * 60 * 8),
  );
}
