import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const CAMPAIGN_SOUND_FX_BUCKET = "campaign-sound-fx";
export const CAMPAIGN_SOUND_FX_MAX_BYTES = 40 * 1024 * 1024;
export type CampaignSoundFx = Tables<"campaign_sound_fx">;

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function soundFxMime(fileName: string, supplied = "") {
  const mime = supplied.toLowerCase();
  if (["audio/mpeg", "audio/ogg", "audio/opus", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/webm"].includes(mime)) return mime;
  const extension = fileName.split(".").pop()?.toLowerCase();
  return ({ mp3: "audio/mpeg", ogg: "audio/ogg", opus: "audio/opus", m4a: "audio/mp4", wav: "audio/wav", webm: "audio/webm" } as Record<string, string>)[extension ?? ""] ?? null;
}

export function validateSoundFxFile(file: Pick<File, "name" | "size" | "type">) {
  if (!soundFxMime(file.name, file.type)) return "Use an MP3, OGG, Opus, M4A, WAV, or WebM audio file.";
  if (file.size === 0) return "That audio file is empty.";
  if (file.size > CAMPAIGN_SOUND_FX_MAX_BYTES) return "The sound effect must be 40 MB or smaller.";
  return null;
}

export async function listCampaignSoundFx(campaignId: string) {
  const { data, error } = await supabase.from("campaign_sound_fx").select("*").eq("campaign_id", campaignId).order("sort_order").order("created_at");
  fail(error);
  return data ?? [];
}

/** Persist a new ordering for the campaign's sound effects. */
export async function reorderCampaignSoundFx(_campaignId: string, orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    const { error } = await supabase.from("campaign_sound_fx").update({ sort_order: i }).eq("id", id);
    fail(error);
  }
}

export async function soundFxSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from(CAMPAIGN_SOUND_FX_BUCKET).createSignedUrl(path, 60 * 60 * 8);
  fail(error);
  return data?.signedUrl ?? "";
}

export async function uploadCampaignSoundFx(campaignId: string, title: string, file: File) {
  const validation = validateSoundFxFile(file);
  if (validation) throw new Error(validation);
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("Enter a sound effect title.");
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");
  const mime = soundFxMime(file.name, file.type);
  if (!mime) throw new Error("Unsupported audio format.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "audio";
  const path = `${user.id}/${campaignId}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await supabase.storage.from(CAMPAIGN_SOUND_FX_BUCKET).upload(path, file, { contentType: mime, upsert: false });
  fail(uploaded.error);
  const { data: last } = await supabase.from("campaign_sound_fx").select("sort_order").eq("campaign_id", campaignId).order("sort_order", { ascending: false }).limit(1);
  const nextSort = (last?.[0]?.sort_order ?? -1) + 1;
  const { error } = await supabase.from("campaign_sound_fx").insert({ campaign_id: campaignId, title: cleanTitle, storage_path: path, file_name: file.name, byte_size: file.size, mime_type: mime, created_by: user.id, sort_order: nextSort });
  if (error) {
    await supabase.storage.from(CAMPAIGN_SOUND_FX_BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

export async function deleteCampaignSoundFx(effect: CampaignSoundFx) {
  const result = await supabase.from("campaign_sound_fx").delete().eq("id", effect.id);
  fail(result.error);
  await supabase.storage.from(CAMPAIGN_SOUND_FX_BUCKET).remove([effect.storage_path]);
}

export async function triggerCampaignSoundFx(campaignId: string, effectId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You need to be signed in.");
  const result = await supabase.from("campaign_sound_fx_state").upsert({ campaign_id: campaignId, effect_id: effectId, event_id: crypto.randomUUID(), changed_by: auth.user.id, changed_at: new Date().toISOString() });
  fail(result.error);
}