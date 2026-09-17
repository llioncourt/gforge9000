import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_STAGES } from "@/lib/adaptation/ai-schemas";

/**
 * Authenticated entry point for the AI reconstruction pipeline.
 *
 * The caller must be the GM of the campaign owning the adaptation: the check
 * runs against the adaptation row itself, using the caller's own credentials,
 * so RLS is the security boundary rather than a client-side flag.
 */

const inputSchema = z.object({
  adaptation_id: z.string().uuid(),
  stage: z.enum(AI_STAGES),
  /** Pre-assembled source material for this chunk. */
  context: z.string().min(1).max(400_000),
  instructions: z.string().max(4000).optional(),
  chunk_index: z.number().int().min(0).default(0),
  chunk_total: z.number().int().min(1).default(1),
});

export const runAdaptationStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Reading the adaptation with the caller's client proves GM access: RLS
    // returns nothing for anyone else.
    const { data: project, error } = await (context.supabase as never as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
        };
      };
    })
      .from("adaptation_projects")
      .select("id")
      .eq("id", data.adaptation_id)
      .maybeSingle();

    if (error || !project) throw new Error("You cannot run this adaptation.");

    const { runStage } = await import("@/lib/adaptation/ai.server");
    const result = await runStage(data.stage, data.context, data.instructions);
    return {
      stage: data.stage,
      chunk_index: data.chunk_index,
      chunk_total: data.chunk_total,
      result: result as Record<string, unknown>,
    };
  });
