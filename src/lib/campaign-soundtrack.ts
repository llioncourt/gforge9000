import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { CampaignSoundtrackManifest } from "@/lib/campaign-soundtrack-pack";

export const CAMPAIGN_SOUNDTRACK_BUCKET = "campaign-soundtracks";
export type SoundtrackAlbum = Tables<"campaign_soundtrack_albums">;
export type SoundtrackTrack = Tables<"campaign_soundtrack_tracks">;
export type SoundtrackState = Tables<"campaign_soundtrack_state">;

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listCampaignSoundtracks(campaignId: string) {
  const [albumsResult, tracksResult, stateResult] = await Promise.all([
    supabase.from("campaign_soundtrack_albums").select("*").eq("campaign_id", campaignId).order("created_at"),
    supabase.from("campaign_soundtrack_tracks").select("*").eq("campaign_id", campaignId).order("position"),
    supabase.from("campaign_soundtrack_state").select("*").eq("campaign_id", campaignId).maybeSingle(),
  ]);
  fail(albumsResult.error); fail(tracksResult.error); fail(stateResult.error);
  return { albums: albumsResult.data ?? [], tracks: tracksResult.data ?? [], state: stateResult.data ?? null };
}

export async function soundtrackSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from(CAMPAIGN_SOUNDTRACK_BUCKET).createSignedUrl(path, 60 * 60 * 8);
  fail(error);
  return data?.signedUrl ?? "";
}

export async function importCampaignSoundtrack(
  campaignId: string,
  manifest: CampaignSoundtrackManifest,
  cover: { name: string; bytes: Uint8Array },
  tracks: Array<{ position: number; name: string; bytes: Uint8Array; mime: string }>,
) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");
  const albumId = crypto.randomUUID();
  const root = `${user.id}/${campaignId}/${albumId}`;
  const uploaded: string[] = [];
  try {
    const coverPath = `${root}/cover.avif`;
    const coverUpload = await supabase.storage.from(CAMPAIGN_SOUNDTRACK_BUCKET).upload(coverPath, new Blob([cover.bytes.slice().buffer as ArrayBuffer], { type: "image/avif" }), { contentType: "image/avif", upsert: false });
    fail(coverUpload.error); uploaded.push(coverPath);
    for (const track of tracks) {
      const safeName = track.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${root}/tracks/${String(track.position).padStart(2, "0")}-${safeName}`;
      const result = await supabase.storage.from(CAMPAIGN_SOUNDTRACK_BUCKET).upload(path, new Blob([track.bytes.slice().buffer as ArrayBuffer], { type: track.mime }), { contentType: track.mime, upsert: false });
      fail(result.error); uploaded.push(path);
    }
    const albumResult = await supabase.from("campaign_soundtrack_albums").insert({
      id: albumId, campaign_id: campaignId, slug: manifest.album.slug, title: manifest.album.title,
      subtitle: manifest.album.subtitle ?? null, description: manifest.album.description ?? null,
      composer: manifest.album.composer ?? null, release_year: manifest.album.release_year ?? null,
      cover_path: coverPath,
    });
    fail(albumResult.error);
    const rows = tracks.map((track) => {
      const meta = manifest.tracks.find((item) => item.position === track.position);
      return {
        campaign_id: campaignId, album_id: albumId, position: track.position,
        title: meta?.title ?? track.name, composer: meta?.composer ?? manifest.album.composer ?? null,
        duration_seconds: meta?.duration_seconds ?? null,
        storage_path: uploaded.find((path) => path.includes(`/tracks/${String(track.position).padStart(2, "0")}-`)) ?? "",
        file_name: track.name, byte_size: track.bytes.length, mime_type: track.mime,
      };
    });
    const tracksResult = await supabase.from("campaign_soundtrack_tracks").insert(rows);
    fail(tracksResult.error);
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(CAMPAIGN_SOUNDTRACK_BUCKET).remove(uploaded);
    await supabase.from("campaign_soundtrack_albums").delete().eq("id", albumId);
    throw error;
  }
}

export async function deleteCampaignSoundtrack(album: SoundtrackAlbum, tracks: SoundtrackTrack[]) {
  const paths = [album.cover_path, ...tracks.filter((track) => track.album_id === album.id).map((track) => track.storage_path)];
  const result = await supabase.from("campaign_soundtrack_albums").delete().eq("id", album.id);
  fail(result.error);
  if (paths.length) await supabase.storage.from(CAMPAIGN_SOUNDTRACK_BUCKET).remove(paths);
}

export async function setCampaignSoundtrackState(input: {
  campaignId: string; albumId: string | null; trackId: string | null; isPlaying: boolean; positionSeconds: number;
}) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");
  const result = await supabase.from("campaign_soundtrack_state").upsert({
    campaign_id: input.campaignId, album_id: input.albumId, track_id: input.trackId,
    is_playing: input.isPlaying, position_seconds: Math.max(0, input.positionSeconds),
    changed_at: new Date().toISOString(), changed_by: user.id,
  });
  fail(result.error);
}
