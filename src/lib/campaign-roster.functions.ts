import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({ campaignId: z.string().uuid() });

export type CampaignRosterCard = {
  id: string;
  ownerId: string;
  characterName: string;
  playerName: string | null;
  portraitUrl: string | null;
};

export const listCampaignRosterCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<CampaignRosterCard[]> => {
    const { data: campaign, error: campaignError } = await context.supabase
      .from("campaigns")
      .select("id")
      .eq("id", data.campaignId)
      .maybeSingle();

    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) throw new Error("Campaign not found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: characters, error: charactersError } = await supabaseAdmin
      .from("characters")
      .select("id, owner_id, name, player_name, portrait_path")
      .eq("campaign_id", data.campaignId)
      .eq("approved", true)
      .eq("is_npc", false)
      .order("name");

    if (charactersError) throw new Error(charactersError.message);

    const ownerIds = [...new Set((characters ?? []).map((character) => character.owner_id))];
    const { data: profiles, error: profilesError } = ownerIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", ownerIds)
      : { data: [], error: null };

    if (profilesError) throw new Error(profilesError.message);
    const displayNameByOwner = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile.display_name]),
    );

    return Promise.all(
      (characters ?? []).map(async (character) => {
        let portraitUrl: string | null = null;
        if (character.portrait_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from("portraits")
            .createSignedUrl(character.portrait_path, 60 * 60 * 8);
          portraitUrl = signed?.signedUrl ?? null;
        }

        return {
          id: character.id,
          ownerId: character.owner_id,
          characterName: character.name,
          playerName: displayNameByOwner.get(character.owner_id) ?? character.player_name,
          portraitUrl,
        };
      }),
    );
  });
