import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildLorePrompt, type LoreDraft } from "@/lib/ai-lore";

const DraftInput = z.object({
  campaignId: z.string().uuid(),
  kind: z.string().min(1),
  brief: z.string().min(3).max(2000),
  context: z.string().max(6000).optional(),
});

export const draftLoreEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DraftInput.parse(input))
  .handler(async ({ data, context }): Promise<LoreDraft> => {
    // Only the campaign's game master may generate drafts.
    const { data: campaign, error } = await context.supabase
      .from("campaigns")
      .select("id, owner_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campaign || campaign.owner_id !== context.userId) {
      throw new Error("Only the game master can generate drafts for this campaign.");
    }

    const { requestLoreDraft } = await import("@/lib/ai-lore.server");
    return requestLoreDraft(buildLorePrompt(data.kind, data.brief, data.context));
  });
