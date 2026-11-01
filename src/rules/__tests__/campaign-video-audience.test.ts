import { describe, expect, it } from "vitest";
import { canPlayerSeeCampaignVideo } from "@/lib/campaign-video-audience";

const ana = "11111111-1111-4111-8111-111111111111";
const bruno = "22222222-2222-4222-8222-222222222222";

describe("campaign video audience", () => {
  it("visible to players means every player sees it", () => {
    expect(canPlayerSeeCampaignVideo({ visible_to_players: true, visible_to_user_ids: [] }, ana)).toBe(true);
  });

  it("hidden with no players picked means no player sees it", () => {
    expect(canPlayerSeeCampaignVideo({ visible_to_players: false, visible_to_user_ids: [] }, ana)).toBe(false);
  });

  it("hidden with picked players shows it only to those players", () => {
    const video = { visible_to_players: false, visible_to_user_ids: [ana] };
    expect(canPlayerSeeCampaignVideo(video, ana)).toBe(true);
    expect(canPlayerSeeCampaignVideo(video, bruno)).toBe(false);
  });
});
