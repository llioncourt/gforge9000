import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const CAMPAIGN_INTRO_BUCKET = "campaign-intros";
export const CAMPAIGN_INTRO_MAX_BYTES = 250 * 1024 * 1024;

export type CampaignIntro = Tables<"campaign_intros">;
export type CampaignIntroView = Tables<"campaign_intro_views">;

export function validateCampaignIntroFile(file: Pick<File, "name" | "size" | "type">): string | null {
  const isMp4 = file.type.toLowerCase() === "video/mp4" || /\.mp4$/i.test(file.name);
  if (!isMp4) return "Use an MP4 video file.";
  if (file.size === 0) return "That video is empty.";
  if (file.size > CAMPAIGN_INTRO_MAX_BYTES) return "The intro video must be 250 MB or smaller.";
  return null;
}

export function shouldBlockForCampaignIntro(
  intro: CampaignIntro | null | undefined,
  view: CampaignIntroView | null | undefined,
) {
  return Boolean(intro && (!view || view.intro_version !== intro.version || !view.do_not_show_again));
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function getCampaignIntro(campaignId: string): Promise<CampaignIntro | null> {
  const { data, error } = await supabase
    .from("campaign_intros")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  fail(error);
  return data;
}

export async function getMyCampaignIntroView(campaignId: string): Promise<CampaignIntroView | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You need to be signed in.");
  const { data, error } = await supabase
    .from("campaign_intro_views")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  fail(error);
  return data;
}

export async function campaignIntroUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(CAMPAIGN_INTRO_BUCKET)
    .createSignedUrl(path, 60 * 60 * 8);
  fail(error);
  return data?.signedUrl ?? "";
}

export function campaignIntroFileName(campaignName: string | null | undefined) {
  const base = (campaignName ?? "").trim().replace(/[\\/:*?"<>|]+/g, "").trim();
  return `${base || "Campaign"}_intro.mp4`;
}

export async function uploadCampaignIntro(campaignId: string, file: File) {
  const validation = validateCampaignIntroFile(file);
  if (validation) throw new Error(validation);
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name")
    .eq("id", campaignId)
    .maybeSingle();

  const current = await getCampaignIntro(campaignId);
  const path = `${user.id}/${campaignId}/${crypto.randomUUID()}.mp4`;
  const { error: uploadError } = await supabase.storage
    .from(CAMPAIGN_INTRO_BUCKET)
    .upload(path, file, { contentType: "video/mp4", upsert: false });
  fail(uploadError);

  const { error } = await supabase.from("campaign_intros").upsert({
    campaign_id: campaignId,
    storage_path: path,
    file_name: campaignIntroFileName(campaign?.name),
    byte_size: file.size,
    mime_type: "video/mp4",
    version: crypto.randomUUID(),
    created_by: user.id,
  });
  if (error) {
    await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  if (current?.storage_path) {
    await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove([current.storage_path]);
  }
}

export async function removeCampaignIntro(intro: CampaignIntro) {
  const { error } = await supabase.from("campaign_intros").delete().eq("campaign_id", intro.campaign_id);
  fail(error);
  await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove([intro.storage_path]);
}

export async function saveCampaignIntroView(campaignId: string, introVersion: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You need to be signed in.");
  const { error } = await supabase.from("campaign_intro_views").upsert({
    campaign_id: campaignId,
    user_id: auth.user.id,
    intro_version: introVersion,
    completed_at: new Date().toISOString(),
    do_not_show_again: true,
  });
  fail(error);
}