import { supabase } from "@/integrations/supabase/client";
import { currentUser } from "@/lib/current-user";
import { ASSET_BUCKET, ASSET_MAX_BYTES, assetPathFor, assetUrl } from "@/lib/assets";
import { isImageFile, toAvifIfImage } from "@/lib/image-avif";

export const CAMPAIGN_COVER_SETTING = "cover_path";

/** Vertical framing of the cover crop: 0 = top, 50 = center, 100 = bottom. */
export const CAMPAIGN_COVER_POSITION_SETTING = "cover_position_y";

export function coverPositionFromSettings(settings: Record<string, unknown>): number {
  const raw = Number(settings[CAMPAIGN_COVER_POSITION_SETTING]);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export function validateCampaignCover(file: File): string | null {
  if (!isImageFile(file)) return "Choose an image file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > ASSET_MAX_BYTES) return "Image is too large (max 25 MB).";
  return null;
}

export async function uploadCampaignCover(campaignId: string, file: File): Promise<string> {
  const problem = validateCampaignCover(file);
  if (problem) throw new Error(problem);

  const { data } = await currentUser();
  if (!data.user) throw new Error("You need to be signed in.");

  const converted = await toAvifIfImage(file);
  const path = assetPathFor(data.user.id, campaignId, converted.name);
  const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, converted, {
    contentType: converted.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeCampaignCoverFile(path: string): Promise<void> {
  const { error } = await supabase.storage.from(ASSET_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export const campaignCoverUrl = assetUrl;
