/**
 * Who among the players can see a campaign video: everyone when
 * `visible_to_players` is on, otherwise only the players listed in
 * `visible_to_user_ids`. The GM always sees every video.
 * Mirrors the database read rule so app and assistant tools agree.
 */
export function canPlayerSeeCampaignVideo(
  video: { visible_to_players: boolean; visible_to_user_ids?: string[] | null },
  userId: string,
) {
  return video.visible_to_players || (video.visible_to_user_ids ?? []).includes(userId);
}
