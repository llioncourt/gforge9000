import { describe, expect, it } from "vitest";
import {
  campaignSoundtrackManifestSchema,
  formatSoundtrackTime,
  soundtrackAudioMime,
} from "@/lib/campaign-soundtrack-pack";

const valid = {
  packVersion: 1,
  album: { slug: "night-run", title: "Night Run", cover: "cover.avif" },
  tracks: [{ position: 1, title: "Opening", file: "tracks/01-opening.mp3" }],
};

describe("campaign soundtrack package", () => {
  it("accepts the Silicon Studios v1 manifest", () =>
    expect(campaignSoundtrackManifestSchema.parse(valid).album.slug).toBe("night-run"));
  it("rejects invalid slugs and unsupported versions", () => {
    expect(() => campaignSoundtrackManifestSchema.parse({ ...valid, packVersion: 2 })).toThrow();
    expect(() =>
      campaignSoundtrackManifestSchema.parse({
        ...valid,
        album: { ...valid.album, slug: "Night Run" },
      }),
    ).toThrow();
  });
  it("recognizes supported audio containers", () => {
    expect(soundtrackAudioMime("music.MP3")).toBe("audio/mpeg");
    expect(soundtrackAudioMime("music.wav")).toBeNull();
  });
  it("formats playback time", () => expect(formatSoundtrackTime(125.9)).toBe("2:05"));
});
