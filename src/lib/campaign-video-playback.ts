import { supabase } from "@/integrations/supabase/client";
import { derivePlaybackPosition, type PlaybackAnchor } from "@/lib/playback-anchor";

/**
 * Shared, GM-driven video playback for a campaign. One row per campaign holds
 * the anchor (position at the last change + when it changed); the live position
 * is always derived, so pause/resume lands on the exact same frame for everyone.
 */
export interface CampaignVideoPlayback extends PlaybackAnchor {
  campaign_id: string;
  video_id: string | null;
  loop_one: boolean;
  changed_by: string;
}

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/* The table is newer than the generated types, so reads/writes go through a
 * loosely typed client here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types yet
const db = supabase as any;

export async function getCampaignVideoPlayback(
  campaignId: string,
): Promise<CampaignVideoPlayback | null> {
  const { data, error } = await db
    .from("campaign_video_playback")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  fail(error);
  return (data as CampaignVideoPlayback | null) ?? null;
}

export async function setCampaignVideoPlayback(input: {
  campaignId: string;
  videoId: string | null;
  isPlaying: boolean;
  positionSeconds: number;
  loopOne?: boolean;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");
  const { error } = await db.from("campaign_video_playback").upsert({
    campaign_id: input.campaignId,
    video_id: input.videoId,
    is_playing: input.isPlaying,
    anchor_position_seconds: Math.max(0, input.positionSeconds),
    anchored_at: new Date().toISOString(),
    loop_one: input.loopOne ?? false,
    changed_by: user.id,
  });
  fail(error);
}

export function campaignVideoPosition(
  state: CampaignVideoPlayback | null,
  durationSeconds: number | null = null,
  nowMs: number = Date.now(),
): number {
  return derivePlaybackPosition(state, durationSeconds, nowMs);
}
