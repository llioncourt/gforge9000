import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { MatchResolution } from "@/lib/trait-match";

const Item = z.object({ kind: z.string().min(1).max(40), name: z.string().min(1).max(160) });

const MatchInput = z.object({
  items: z.array(Item).min(1).max(80),
  candidates: z.array(Item).min(1).max(400),
});

/**
 * Best-effort name reconciliation for character imports. Callers treat a
 * failure as "no matches" so an import never breaks because of AI.
 */
export const matchImportedTraits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MatchInput.parse(input))
  .handler(async ({ data }): Promise<MatchResolution[]> => {
    const { requestTraitMatches } = await import("@/lib/trait-match.server");
    return requestTraitMatches(data.items, data.candidates);
  });
