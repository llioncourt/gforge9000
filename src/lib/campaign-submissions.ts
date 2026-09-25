import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { uploadCampaignVideo, validateCampaignVideoFile, type CampaignVideoType } from "@/lib/campaign-intro";
import { uploadCampaignSoundFx, validateSoundFxFile } from "@/lib/campaign-sound-fx";
import { createAsset, uploadAssetFile } from "@/lib/assets";

export const CAMPAIGN_SUBMISSIONS_BUCKET = "campaign-submissions";
export const SUBMISSION_KINDS = ["video", "sound_fx", "image", "soundtrack"] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];
export type CampaignSubmission = Tables<"campaign_submissions">;

export const SUBMISSION_ACCEPT: Record<SubmissionKind, string> = {
  video: "video/mp4,.mp4",
  sound_fx: "audio/*,.mp3,.ogg,.opus,.m4a,.wav,.webm",
  image: "image/*",
  soundtrack: ".zip,application/zip",
};

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** Pure validation per submission kind; returns an error message or null. */
export function validateSubmissionFile(
  kind: SubmissionKind,
  file: Pick<File, "name" | "size" | "type">,
): string | null {
  if (file.size === 0) return "That file is empty.";
  if (kind === "video") return validateCampaignVideoFile(file as File);
  if (kind === "sound_fx") return validateSoundFxFile(file);
  if (kind === "image") return file.type.startsWith("image/") ? null : "Choose an image file.";
  return /\.zip$/i.test(file.name) ? null : "Choose a ZIP file.";
}

export async function listSubmissions(campaignId: string): Promise<CampaignSubmission[]> {
  const { data, error } = await supabase
    .from("campaign_submissions")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  fail(error);
  return data ?? [];
}

export async function submitContent(input: {
  campaignId: string;
  kind: SubmissionKind;
  title: string;
  videoType?: CampaignVideoType | null;
  file: File;
}) {
  const invalid = validateSubmissionFile(input.kind, input.file);
  if (invalid) throw new Error(invalid);
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");
  const safe = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${input.campaignId}/${user.id}/${crypto.randomUUID()}-${safe}`;
  const mime = input.file.type || "application/octet-stream";
  const up = await supabase.storage
    .from(CAMPAIGN_SUBMISSIONS_BUCKET)
    .upload(path, input.file, { contentType: mime, upsert: false });
  fail(up.error);
  const { error } = await supabase.from("campaign_submissions").insert({
    campaign_id: input.campaignId,
    submitted_by: user.id,
    kind: input.kind,
    title: input.title.trim(),
    video_type: input.kind === "video" ? (input.videoType ?? "other") : null,
    storage_path: path,
    file_name: input.file.name,
    mime_type: mime,
    byte_size: input.file.size,
  });
  if (error) {
    await supabase.storage.from(CAMPAIGN_SUBMISSIONS_BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

export async function deleteSubmission(row: CampaignSubmission) {
  const { error } = await supabase.from("campaign_submissions").delete().eq("id", row.id);
  fail(error);
  await supabase.storage.from(CAMPAIGN_SUBMISSIONS_BUCKET).remove([row.storage_path]);
}

export async function submissionUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(CAMPAIGN_SUBMISSIONS_BUCKET)
    .createSignedUrl(path, 60 * 60);
  fail(error);
  return data?.signedUrl ?? "";
}

/**
 * GM approval: copies the file into the official campaign section using the
 * same upload paths the GM uses, then removes the submission.
 */
export async function approveSubmission(
  row: CampaignSubmission,
  importSoundtrack: (campaignId: string, file: File) => Promise<void>,
) {
  const dl = await supabase.storage.from(CAMPAIGN_SUBMISSIONS_BUCKET).download(row.storage_path);
  fail(dl.error);
  const file = new File([dl.data!], row.file_name, { type: row.mime_type });
  if (row.kind === "video") {
    await uploadCampaignVideo(row.campaign_id, file, {
      title: row.title,
      videoType: (row.video_type ?? "other") as CampaignVideoType,
    });
  } else if (row.kind === "sound_fx") {
    await uploadCampaignSoundFx(row.campaign_id, row.title, file);
  } else if (row.kind === "image") {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("You need to be signed in.");
    const stored = await uploadAssetFile(row.campaign_id, file);
    await createAsset({
      campaign_id: row.campaign_id,
      title: row.title,
      storage_path: stored.path,
      mime_type: stored.mimeType,
      byte_size: stored.byteSize,
      created_by: auth.user.id,
    });
  } else {
    await importSoundtrack(row.campaign_id, file);
  }
  await deleteSubmission(row);
}

export async function setMemberRole(campaignId: string, userId: string, role: "player" | "producer") {
  const { error } = await supabase.rpc("set_campaign_member_role", {
    _campaign: campaignId,
    _user: userId,
    _role: role,
  });
  fail(error);
}
