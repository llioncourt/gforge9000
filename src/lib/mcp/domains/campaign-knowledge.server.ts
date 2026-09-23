/**
 * Player-specific reveals: who has been shown which world entry.
 *
 * A grant on a GM-only or unrevealed entry atomically promotes it to
 * "selected players" visibility (see `src/lib/reveal.ts` for the app's own
 * version of this flow) — grant/revoke are done through the matching
 * security-definer RPCs so that promotion/demotion stays atomic with the
 * grant row itself.
 */

import { z } from "zod/v4";
import {
  CREATE,
  DESTROY,
  READ,
  actionRouter,
  detailReply,
  domainOutput,
  fail,
  isCampaignMember,
  limitField,
  listReply,
  loadCampaign,
  requireGmFor,
  safeRpc,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, Structured, ToolRegistrar } from "@/lib/mcp/kit.server";
import { kindDef } from "@/lib/entity-kinds";

const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      campaign_id: uuid,
      user_id: uuid.optional(),
      entity_id: uuid.optional(),
      limit: limitField,
    })
    .describe(
      "List knowledge grants for a campaign, optionally filtered to one recipient or one entity.",
    ),
  z
    .object({
      action: z.literal("grant"),
      campaign_id: uuid,
      entity_id: uuid,
      user_id: uuid,
      note: z.string().max(2000).optional(),
    })
    .describe(
      "Reveal one entity to one player: grants knowledge and, if the entity is still GM-only " +
        "or unrevealed, promotes it to Selected players so the grant actually takes effect. " +
        "Also creates a best-effort in-app notification for the player. GM only.",
    ),
  z
    .object({ action: z.literal("revoke"), grant_id: uuid })
    .describe(
      "Remove one knowledge grant. If it was the last grant keeping a Selected-players entity " +
        "visible, the entity is demoted back to GM-only. GM only.",
    ),
]);

async function requireGmOfEntity(
  ctx: McpToolContext,
  campaignId: string,
  entityId: string,
): Promise<{ id: string; name: string; kind: string; campaign_id: string }> {
  const campaign = await loadCampaign(ctx, campaignId);
  requireGmFor(campaign, "reveal entries to players");
  const { data, error } = await ctx.supabase
    .from("entities")
    .select("id, name, kind, campaign_id")
    .eq("id", entityId)
    .maybeSingle();
  if (error) fail("Entry lookup", error);
  if (!data) throw new Error("Entry not found, or you do not have access to it.");
  if (data.campaign_id !== campaignId) {
    throw new Error("That entry does not belong to this campaign.");
  }
  return data;
}

export function registerCampaignKnowledge(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "campaign_knowledge",
    {
      title: "Campaign knowledge grants",
      description:
        "Manage per-player reveals of world entries. Actions: list (read grants for a campaign, " +
        "optionally filtered by recipient or entity), grant (reveal an entry to a player, " +
        "promoting it out of GM-only if needed, GM only, changes data), revoke (remove a grant, " +
        "possibly demoting the entry back to GM-only, GM only, deletes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      list: async (i) => {
        const member = await isCampaignMember(ctx, i.campaign_id);
        if (!member) throw new Error("You are not a member of this campaign.");
        const limit = i.limit ?? 50;

        let query = ctx.supabase
          .from("knowledge_grants")
          .select("id, campaign_id, entity_id, user_id, granted_by, note, created_at")
          .eq("campaign_id", i.campaign_id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (i.user_id) query = query.eq("user_id", i.user_id);
        if (i.entity_id) query = query.eq("entity_id", i.entity_id);
        const { data, error } = await query;
        if (error) fail("Listing knowledge grants", error);
        const rows = data ?? [];

        let countQuery = ctx.supabase
          .from("knowledge_grants")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", i.campaign_id);
        if (i.user_id) countQuery = countQuery.eq("user_id", i.user_id);
        if (i.entity_id) countQuery = countQuery.eq("entity_id", i.entity_id);
        const { count, error: countError } = await countQuery;
        if (countError) fail("Counting knowledge grants", countError);

        const entityIds = [...new Set(rows.map((row) => row.entity_id))];
        const userIds = [...new Set(rows.map((row) => row.user_id))];
        const nameByEntity = new Map<string, string>();
        const nameByUser = new Map<string, string>();
        if (entityIds.length > 0) {
          // Filtered read: direct table reads are GM-only, and this branch also
          // serves players looking at their own grants.
          const { data: entities, error: entityError } = await safeRpc(ctx.supabase)(
            "list_entities_safe",
            { _campaign: i.campaign_id },
          ).in("id", entityIds);
          if (entityError) fail("Entry lookup", entityError);
          for (const entity of entities ?? []) nameByEntity.set(entity.id, entity.name);
        }
        if (userIds.length > 0) {
          const { data: profiles, error: profileError } = await ctx.supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", userIds);
          if (profileError) fail("Profile lookup", profileError);
          for (const profile of profiles ?? []) nameByUser.set(profile.id, profile.display_name);
        }

        const items: Structured[] = rows.map((row) => ({
          ...row,
          entity_name: nameByEntity.get(row.entity_id) ?? null,
          display_name: nameByUser.get(row.user_id) ?? null,
        }));
        return listReply("knowledge grants", items, count ?? items.length);
      },

      grant: async (i) => {
        const entity = await requireGmOfEntity(ctx, i.campaign_id, i.entity_id);
        const { data, error } = await ctx.supabase.rpc("grant_entity_knowledge", {
          _entity: i.entity_id,
          _user: i.user_id,
          ...(i.note !== undefined ? { _note: i.note } : {}),
        });
        if (error) fail("Granting knowledge", error);

        // Best-effort: the reveal itself already succeeded, so a failed alert
        // must not surface as an error on top of a successful grant.
        try {
          await ctx.supabase.from("notifications").insert({
            user_id: i.user_id,
            campaign_id: i.campaign_id,
            entity_id: i.entity_id,
            kind: "reveal",
            title: `New record revealed: ${entity.name}`,
            body: kindDef(entity.kind).label,
            created_by: ctx.userId,
          });
        } catch {
          /* the record is revealed; the bell alert is best-effort */
        }

        return detailReply(`"${entity.name}" revealed to the player.`, data as Structured);
      },

      revoke: async (i) => {
        const { data: grant, error: grantError } = await ctx.supabase
          .from("knowledge_grants")
          .select("id, campaign_id")
          .eq("id", i.grant_id)
          .maybeSingle();
        if (grantError) fail("Grant lookup", grantError);
        if (!grant) throw new Error("Grant not found, or you do not have access to it.");
        const campaign = await loadCampaign(ctx, grant.campaign_id);
        requireGmFor(campaign, "revoke reveals");

        const { data, error } = await ctx.supabase.rpc("revoke_entity_knowledge", {
          _grant: i.grant_id,
        });
        if (error) fail("Revoking knowledge", error);
        return detailReply("Knowledge grant revoked.", data as Structured);
      },
    }),
  );
}
