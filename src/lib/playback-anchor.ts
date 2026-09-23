/**
 * Shared playback maths for GM-controlled campaign media (soundtrack + video).
 *
 * The stored state is an anchor, not a live position: `anchor_position_seconds`
 * is where the media was at the instant of the last change, and `anchored_at`
 * is when that change happened. The current position is always derived from
 * those two values, so pause/resume lands on the exact same point regardless of
 * who is listening or when they joined.
 *
 * Pure functions only — no React, no Supabase, so both the MCP tools and the
 * browser player can share one definition.
 */

export interface PlaybackAnchor {
  is_playing: boolean;
  anchor_position_seconds: number;
  anchored_at: string;
  loop_one?: boolean | null;
}

/** Below this, a client must not touch currentTime: re-seeking causes stutter. */
export const PLAYBACK_DRIFT_TOLERANCE_SECONDS = 1.5;

function clampToDuration(position: number, duration: number | null, loopOne: boolean): number {
  if (position <= 0) return 0;
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return position;
  if (loopOne) return position % duration;
  return Math.min(position, duration);
}

/**
 * Current position in seconds: while playing, the anchor plus the time elapsed
 * since it was set; while paused, the anchor itself.
 */
export function derivePlaybackPosition(
  state: PlaybackAnchor | null | undefined,
  durationSeconds: number | null = null,
  nowMs: number = Date.now(),
): number {
  if (!state) return 0;
  const anchor = Math.max(0, Number(state.anchor_position_seconds) || 0);
  if (!state.is_playing) return clampToDuration(anchor, durationSeconds, false);
  const anchoredAt = Date.parse(state.anchored_at);
  const elapsed = Number.isFinite(anchoredAt) ? Math.max(0, (nowMs - anchoredAt) / 1000) : 0;
  return clampToDuration(anchor + elapsed, durationSeconds, state.loop_one === true);
}

/** True when the local element is far enough off the shared position to correct. */
export function shouldCorrectDrift(
  currentTime: number,
  targetSeconds: number,
  tolerance: number = PLAYBACK_DRIFT_TOLERANCE_SECONDS,
): boolean {
  return Math.abs(currentTime - targetSeconds) > tolerance;
}
