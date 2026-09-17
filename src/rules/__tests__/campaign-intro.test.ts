import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_INTRO_MAX_BYTES,
  shouldBlockForCampaignIntro,
  validateCampaignIntroFile,
} from "@/lib/campaign-intro";

describe("campaign intro", () => {
  it("accepts non-empty MP4 files within the limit", () => {
    expect(
      validateCampaignIntroFile({ name: "intro.mp4", type: "video/mp4", size: 1024 }),
    ).toBeNull();
  });

  it("rejects other formats, empty files, and oversized videos", () => {
    expect(
      validateCampaignIntroFile({ name: "intro.webm", type: "video/webm", size: 1024 }),
    ).toContain("MP4");
    expect(validateCampaignIntroFile({ name: "intro.mp4", type: "video/mp4", size: 0 })).toContain(
      "empty",
    );
    expect(
      validateCampaignIntroFile({
        name: "intro.mp4",
        type: "video/mp4",
        size: CAMPAIGN_INTRO_MAX_BYTES + 1,
      }),
    ).toContain("250 MB");
  });

  it("only skips the current version after the viewer opts out", () => {
    const intro = { version: "new-version" } as never;
    expect(shouldBlockForCampaignIntro(intro, null)).toBe(true);
    expect(
      shouldBlockForCampaignIntro(intro, {
        intro_version: "old-version",
        do_not_show_again: true,
      } as never),
    ).toBe(true);
    expect(
      shouldBlockForCampaignIntro(intro, {
        intro_version: "new-version",
        do_not_show_again: false,
      } as never),
    ).toBe(true);
    expect(
      shouldBlockForCampaignIntro(intro, {
        intro_version: "new-version",
        do_not_show_again: true,
      } as never),
    ).toBe(false);
  });
});
