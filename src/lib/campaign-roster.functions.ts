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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // The membership check (with the caller's own access) and the card rows
    // are read together; nothing is returned unless the check passes.
    const [campaignResult, charactersResult] = await Promise.all([
      context.supabase.from("campaigns").select("id").eq("id", data.campaignId).maybeSingle(),
      supabaseAdmin
        .from("characters")
        .select("id, owner_id, name, player_name, portrait_path")
        .eq("campaign_id", data.campaignId)
        .eq("approved", true)
        .eq("is_npc", false)
        .order("name"),
    ]);

    if (campaignResult.error) throw new Error(campaignResult.error.message);
    if (!campaignResult.data) throw new Error("Campaign not found.");
    if (charactersResult.error) throw new Error(charactersResult.error.message);

    const characters = charactersResult.data ?? [];
    const ownerIds = [...new Set(characters.map((character) => character.owner_id))];
    const portraitPaths = [
      ...new Set(
        characters
          .map((character) => character.portrait_path)
          .filter((path): path is string => !!path),
      ),
    ];

    // Player names and every portrait address in two parallel calls, instead
    // of one signing request per character.
    const [profilesResult, signedResult] = await Promise.all([
      ownerIds.length
        ? supabaseAdmin.from("profiles").select("id, display_name").in("id", ownerIds)
        : Promise.resolve({ data: [], error: null }),
      portraitPaths.length
        ? supabaseAdmin.storage.from("portraits").createSignedUrls(portraitPaths, 60 * 60 * 8)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (profilesResult.error) throw new Error(profilesResult.error.message);
    const displayNameByOwner = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]),
    );
    // A portrait that cannot be signed simply shows no picture, as before.
    const urlByPath = new Map<string, string>();
    for (const signed of signedResult.data ?? []) {
      if (!signed.error && signed.path && signed.signedUrl) {
        urlByPath.set(signed.path, signed.signedUrl);
      }
    }

    return characters.map((character) => ({
      id: character.id,
      ownerId: character.owner_id,
      characterName: character.name,
      playerName: displayNameByOwner.get(character.owner_id) ?? character.player_name,
      portraitUrl: character.portrait_path
        ? (urlByPath.get(character.portrait_path) ?? null)
        : null,
    }));
  });
