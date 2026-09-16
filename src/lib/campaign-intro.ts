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

export type CampaignVideoUploadProgress = { percent: number; label: string };

export async function uploadCampaignVideo(
  campaignId: string,
  file: File,
  input: {
    title: string;
    videoType: CampaignVideoType;
    thumb?: Blob | null;
    /** Package the video for adaptive streaming in the browser before uploading. */
    streaming?: boolean;
    lowQuality?: boolean;
    onProgress?: (progress: CampaignVideoUploadProgress) => void;
  },
) {
  const validation = validateCampaignVideoFile(file);
  if (validation) throw new Error(validation);
  const title = input.title.trim();
  if (!title) throw new Error("Enter a video title.");
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");
  const report = input.onProgress ?? (() => undefined);
  const currentIntro = input.videoType === "intro" ? await getCampaignIntro(campaignId) : null;
  const videoId = crypto.randomUUID();
  const path = `${user.id}/${campaignId}/${videoId}.mp4`;
  const cleanup: string[] = [];

  let hlsPath: string | null = null;
  if (input.streaming) {
    const { packageVideoAsHls, uploadHlsPackage } = await import("@/lib/video-hls");
    const bundle = await packageVideoAsHls(file, {
      lowQuality: input.lowQuality,
      onProgress: (progress) => report({ percent: Math.round(progress.percent * 70), label: progress.label }),
    });
    hlsPath = await uploadHlsPackage(`${user.id}/${campaignId}/hls-${videoId}`, bundle, (progress) =>
      report({ percent: 70 + Math.round((progress.percent - 0.85) * 100), label: progress.label }),
    );
  }

  report({ percent: 88, label: "Uploading the original file…" });
  const { error: uploadError } = await supabase.storage
    .from(CAMPAIGN_INTRO_BUCKET)
    .upload(path, file, { contentType: "video/mp4", upsert: false });
  if (uploadError) {
    if (hlsPath) {
      const { removeHlsPackage } = await import("@/lib/video-hls");
      await removeHlsPackage(hlsPath);
    }
    throw new Error(uploadError.message);
  }
  cleanup.push(path);

  let thumbPath: string | null = null;
  if (input.thumb) {
    try {
      thumbPath = await uploadThumbBlob(campaignId, user.id, input.thumb);
      cleanup.push(thumbPath);
    } catch {
      thumbPath = null;
    }
  }
  const rollback = async () => {
    await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove(cleanup);
    if (hlsPath) {
      const { removeHlsPackage } = await import("@/lib/video-hls");
      await removeHlsPackage(hlsPath);
    }
  };
  if (currentIntro) {
    const removed = await supabase.from("campaign_videos").delete().eq("id", currentIntro.id);
    if (removed.error) {
      await rollback();
      throw new Error(removed.error.message);
    }
  }
  report({ percent: 96, label: "Saving the video…" });
  const { error } = await supabase.from("campaign_videos").insert({
    campaign_id: campaignId,
    storage_path: path,
    thumb_path: thumbPath,
    hls_path: hlsPath,
    file_name: file.name,
    title,
    video_type: input.videoType,
    byte_size: file.size,
    mime_type: "video/mp4",
    version: crypto.randomUUID(),
    created_by: user.id,
  });
  if (error) {
    await rollback();
    throw new Error(error.message);
  }
  if (currentIntro?.storage_path) {
    const stale = [currentIntro.storage_path];
    if (currentIntro.thumb_path) stale.push(currentIntro.thumb_path);
    await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove(stale);
    if (currentIntro.hls_path) {
      const { removeHlsPackage } = await import("@/lib/video-hls");
      await removeHlsPackage(currentIntro.hls_path);
    }
  }
  report({ percent: 100, label: "Done." });
}


export async function uploadCampaignIntro(campaignId: string, file: File) {
  const title = file.name.replace(/\.[^.]+$/, "").trim() || "Campaign intro";
  return uploadCampaignVideo(campaignId, file, { title, videoType: "intro" });
}

export async function removeCampaignVideo(video: CampaignVideo) {
  const { error } = await supabase.from("campaign_videos").delete().eq("id", video.id);
  fail(error);
  const paths = [video.storage_path];
  if (video.thumb_path) paths.push(video.thumb_path);
  await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove(paths);
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
export async function campaignVideoThumbUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(CAMPAIGN_INTRO_BUCKET)
    .createSignedUrl(path, 60 * 60 * 8);
  if (error) return "";
  return data?.signedUrl ?? "";
}

async function uploadThumbBlob(campaignId: string, userId: string, blob: Blob) {
  const path = `${userId}/${campaignId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(CAMPAIGN_INTRO_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  fail(error);
  return path;
}

/** Replace the stored thumbnail frame of a video. */
export async function setCampaignVideoThumb(video: CampaignVideo, blob: Blob) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");
  const path = await uploadThumbBlob(video.campaign_id, user.id, blob);
  const { error } = await supabase.from("campaign_videos").update({ thumb_path: path }).eq("id", video.id);
  if (error) {
    await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove([path]);
    throw new Error(error.message);
  }
  if (video.thumb_path) await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove([video.thumb_path]);
}
