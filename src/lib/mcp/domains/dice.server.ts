/**
 * Dice rolling: the server always computes the result — a caller can never
 * hand in a pre-computed total — and every roll is logged to `roll_history`.
 */

import { z } from "zod/v4";
import {
  actionRouter,
  boundedText,
  detailReply,
  domainOutput,
  fail,
  isCampaignMember,
  limitField,
  listReply,
  loadCampaign,
  loadCharacter,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, Structured, ToolRegistrar } from "@/lib/mcp/kit.server";
import { parseDice, resolveSuccess, rollExpression, type Rng } from "@/rules/dice";

/**
 * Cryptographically secure RNG for real rolls, built on Web Crypto rather than
 * Math.random. Returns a float in [0, 1), matching the shape `Rng` expects.
 */
function cryptoRng(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 0) / 4294967296; // 2^32
}

const secureRng: Rng = cryptoRng;

const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("roll"),
      label: boundedText(200),
      expression: boundedText(50),
      target: z.number().int().min(1).max(60).optional(),
      character_id: uuid.optional(),
      campaign_id: uuid.optional(),
    })
    .describe(
      "Roll dice. The server computes the result with a secure random source — a caller-supplied " +
        "total is never accepted. If target is given, the roll is resolved as a success roll " +
        "(margin and outcome). The roll is saved to the roll history under the caller's own " +
        "identity. Changes data.",
    ),
  z
    .object({
      action: z.literal("list_history"),
      campaign_id: uuid.optional(),
      character_id: uuid.optional(),
      limit: limitField,
    })
    .describe(
      "Read past rolls, newest first — your own rolls, plus (if given a campaign you run as GM) " +
        "every roll logged in that campaign.",
    ),
]);

async function assertCharacterAccessible(ctx: McpToolContext, characterId: string): Promise<void> {
  await loadCharacter(ctx, characterId); // throws if not visible under RLS
}

async function assertCampaignAccessible(ctx: McpToolContext, campaignId: string): Promise<void> {
  const campaign = await loadCampaign(ctx, campaignId);
  if (campaign.isGm) return;
  const member = await isCampaignMember(ctx, campaignId);
  if (!member) throw new Error("You are not a member of this campaign.");
}

export function registerDice(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "dice",
    {
      title: "Dice rolls",
      description:
        "Roll dice and read the roll history. Actions: roll (compute and log a dice roll — the " +
        "server always computes the result, changes data), list_history (read past rolls, newest " +
        "first, read-only).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      roll: async (i) => {
        const parsed = parseDice(i.expression);
        if (!parsed) {
          throw new Error(
            `"${i.expression}" is not a valid dice expression. Use a form like "3d6", "1d6+2", or "4d6x2".`,
          );
        }
        if (i.character_id) await assertCharacterAccessible(ctx, i.character_id);
        if (i.campaign_id) await assertCampaignAccessible(ctx, i.campaign_id);

        const roll = rollExpression(i.expression, secureRng);
        if (!roll) throw new Error(`"${i.expression}" is not a valid dice expression.`);

        let margin: number | null = null;
        let outcome: string | null = null;
        if (i.target !== undefined) {
          const resolved = resolveSuccess(roll.total, i.target);
          margin = resolved.margin;
          outcome = resolved.outcome;
        }

        const insert = {
          user_id: ctx.userId,
          label: i.label,
          expression: i.expression,
          dice: roll.dice,
          total: roll.total,
          target: i.target ?? null,
          margin,
          outcome,
          character_id: i.character_id ?? null,
          campaign_id: i.campaign_id ?? null,
        };
        const { data, error } = await ctx.supabase
          .from("roll_history")
          .insert(insert)
          .select("*")
          .single();
        if (error) fail("Saving roll", error);
        return detailReply(
          `${i.label}: ${i.expression} → ${roll.total}${outcome ? ` (${outcome})` : ""}.`,
          data as Structured,
        );
      },

      list_history: async (i) => {
        if (i.campaign_id) await assertCampaignAccessible(ctx, i.campaign_id);
        if (i.character_id) await assertCharacterAccessible(ctx, i.character_id);
        const limit = i.limit ?? 50;

        let query = ctx.supabase
          .from("roll_history")
          .select("*")
          .order("created_at", { ascending: false });
        if (i.campaign_id) query = query.eq("campaign_id", i.campaign_id);
        if (i.character_id) query = query.eq("character_id", i.character_id);
        const { data, error } = await query.limit(limit);
        if (error) fail("Listing roll history", error);

        let countQuery = ctx.supabase
          .from("roll_history")
          .select("id", { count: "exact", head: true });
        if (i.campaign_id) countQuery = countQuery.eq("campaign_id", i.campaign_id);
        if (i.character_id) countQuery = countQuery.eq("character_id", i.character_id);
        const { count, error: countError } = await countQuery;
        if (countError) fail("Counting roll history", countError);

        const items = (data ?? []) as Structured[];
        return listReply("rolls", items, count ?? items.length);
      },
    }),
  );
}
