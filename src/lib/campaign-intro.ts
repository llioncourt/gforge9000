import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const CAMPAIGN_INTRO_BUCKET = "campaign-intros";
export const CAMPAIGN_VIDEO_MAX_BYTES = 250 * 1024 * 1024;
export const CAMPAIGN_INTRO_MAX_BYTES = CAMPAIGN_VIDEO_MAX_BYTES;
export const CAMPAIGN_VIDEO_TYPES = [
  "intro",
  "recap",
  "cutscene",
  "trailer",
  "handout",
  "vision",
  "dream",
  "other",
] as const;
export type CampaignVideoType = (typeof CAMPAIGN_VIDEO_TYPES)[number];
export type CampaignVideo = Tables<"campaign_videos">;
export type CampaignIntro = CampaignVideo;
export type CampaignIntroView = Tables<"campaign_intro_views">;

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function campaignVideoTypeLabel(type: string) {
  return type === "intro" ? "Intro" : type.charAt(0).toUpperCase() + type.slice(1);
}

export function validateCampaignVideoFile(file: Pick<File, "name" | "size" | "type">): string | null {
  const isMp4 = file.type.toLowerCase() === "video/mp4" || /\.mp4$/i.test(file.name);
  if (!isMp4) return "Use an MP4 video file.";
  if (file.size === 0) return "That video is empty.";
  if (file.size > CAMPAIGN_VIDEO_MAX_BYTES) return "The video must be 250 MB or smaller.";
  return null;
}

export const validateCampaignIntroFile = validateCampaignVideoFile;

export function shouldBlockForCampaignIntro(
  intro: CampaignIntro | null | undefined,
  view: CampaignIntroView | null | undefined,
) {
  return Boolean(intro && (!view || view.intro_version !== intro.version || !view.do_not_show_again));
}

export async function listCampaignVideos(campaignId: string): Promise<CampaignVideo[]> {
  const { data, error } = await supabase
    .from("campaign_videos")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at");
  fail(error);
  return data ?? [];
}

export async function getCampaignIntro(campaignId: string): Promise<CampaignIntro | null> {
  const { data, error } = await supabase
    .from("campaign_videos")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("video_type", "intro")
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

export async function uploadCampaignVideo(
  campaignId: string,
  file: File,
  input: { title: string; videoType: CampaignVideoType },
) {
  const validation = validateCampaignVideoFile(file);
  if (validation) throw new Error(validation);
  const title = input.title.trim();
  if (!title) throw new Error("Enter a video title.");
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");
  const currentIntro = input.videoType === "intro" ? await getCampaignIntro(campaignId) : null;
  const path = `${user.id}/${campaignId}/${crypto.randomUUID()}.mp4`;
  const { error: uploadError } = await supabase.storage
    .from(CAMPAIGN_INTRO_BUCKET)
    .upload(path, file, { contentType: "video/mp4", upsert: false });
  fail(uploadError);
  if (currentIntro) {
    const removed = await supabase.from("campaign_videos").delete().eq("id", currentIntro.id);
    if (removed.error) {
      await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove([path]);
      throw new Error(removed.error.message);
    }
  }
  const { error } = await supabase.from("campaign_videos").insert({
    campaign_id: campaignId,
    storage_path: path,
    file_name: file.name,
    title,
    video_type: input.videoType,
    byte_size: file.size,
    mime_type: "video/mp4",
    version: crypto.randomUUID(),
    created_by: user.id,
  });
  if (error) {
    await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  if (currentIntro?.storage_path) {
    await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove([currentIntro.storage_path]);
  }
}

export async function uploadCampaignIntro(campaignId: string, file: File) {
  const title = file.name.replace(/\.[^.]+$/, "").trim() || "Campaign intro";
  return uploadCampaignVideo(campaignId, file, { title, videoType: "intro" });
}

export async function removeCampaignVideo(video: CampaignVideo) {
  const { error } = await supabase.from("campaign_videos").delete().eq("id", video.id);
  fail(error);
  await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove([video.storage_path]);
}

export const removeCampaignIntro = removeCampaignVideo;

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