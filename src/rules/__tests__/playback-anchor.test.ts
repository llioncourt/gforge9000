import { describe, expect, it } from "vitest";
import {
  PLAYBACK_DRIFT_TOLERANCE_SECONDS,
  derivePlaybackPosition,
  shouldCorrectDrift,
} from "@/lib/playback-anchor";

const anchoredAt = "2026-01-01T00:00:00.000Z";
const base = Date.parse(anchoredAt);

describe("derivePlaybackPosition", () => {
  it("returns the frozen anchor while paused, whatever the clock says", () => {
    const state = { is_playing: false, anchor_position_seconds: 42.5, anchored_at: anchoredAt };
    expect(derivePlaybackPosition(state, null, base + 60_000)).toBe(42.5);
  });

  it("adds the elapsed time while playing", () => {
    const state = { is_playing: true, anchor_position_seconds: 10, anchored_at: anchoredAt };
    expect(derivePlaybackPosition(state, null, base + 5_000)).toBe(15);
  });

  it("stops at the media duration when not looping", () => {
    const state = { is_playing: true, anchor_position_seconds: 100, anchored_at: anchoredAt };
    expect(derivePlaybackPosition(state, 120, base + 60_000)).toBe(120);
  });

  it("wraps around the duration when repeat-one is on", () => {
    const state = {
      is_playing: true,
      anchor_position_seconds: 100,
      anchored_at: anchoredAt,
      loop_one: true,
    };
    expect(derivePlaybackPosition(state, 120, base + 60_000)).toBe(40);
  });

  it("never goes backwards when the anchor is in the future or missing", () => {
    expect(derivePlaybackPosition(null)).toBe(0);
    const state = { is_playing: true, anchor_position_seconds: 5, anchored_at: anchoredAt };
    expect(derivePlaybackPosition(state, null, base - 10_000)).toBe(5);
  });

  it("pause then resume returns to the very same point", () => {
    const playing = { is_playing: true, anchor_position_seconds: 30, anchored_at: anchoredAt };
    const paused = {
      is_playing: false,
      anchor_position_seconds: derivePlaybackPosition(playing, null, base + 7_000),
      anchored_at: new Date(base + 7_000).toISOString(),
    };
    expect(paused.anchor_position_seconds).toBe(37);
    const resumed = {
      ...paused,
      is_playing: true,
      anchored_at: new Date(base + 90_000).toISOString(),
    };
    expect(derivePlaybackPosition(resumed, null, base + 90_000)).toBe(37);
  });
});

describe("shouldCorrectDrift", () => {
  it("ignores small differences so playback does not stutter", () => {
    expect(shouldCorrectDrift(10, 11)).toBe(false);
    expect(shouldCorrectDrift(10, 10 + PLAYBACK_DRIFT_TOLERANCE_SECONDS)).toBe(false);
  });

  it("corrects once the gap passes the tolerance", () => {
    expect(shouldCorrectDrift(10, 12)).toBe(true);
    expect(shouldCorrectDrift(12, 10)).toBe(true);
  });
});
