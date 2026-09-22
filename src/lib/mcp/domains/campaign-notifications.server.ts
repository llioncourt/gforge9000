/**
 * In-app notifications ("the bell"). Mirrors `src/lib/notifications.ts`; RLS
 * already scopes rows to their recipient, but the "mine" actions still filter
 * by `ctx.userId` explicitly so the query intent is never left to policy alone.
 */

import { z } from "zod/v4";
import {
  DESTROY,
  MODIFY,
  READ,
  actionRouter,
  deleteReply,
  detailReply,
  domainOutput,
  fail,
  limitField,
  listReply,
  loadCampaign,
  requireGmFor,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, Structured, ToolRegistrar } from "@/lib/mcp/kit.server";
import type { TablesInsert } from "@/integrations/supabase/types";

const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("send"),
      campaign_id: uuid,
      title: z.string().min(1).max(200),
      body: z.string().max(4000).optional(),
      kind: z.string().min(1).max(40).optional(),
      entity_id: uuid.optional(),
      user_id: uuid.optional(),
      all_players: z.boolean().optional(),
    })
    .describe(
      "Send a notification to exactly one recipient: either a specific user_id, or " +
        "all_players: true to fan out to every player (never the GM). GM only, changes data.",
    ),
  z
    .object({ action: z.literal("list_mine"), campaign_id: uuid.optional(), limit: limitField })
    .describe("List the caller's own notifications, newest first, optionally by campaign."),
  z
    .object({ action: z.literal("mark_read"), notification_id: uuid })
    .describe("Mark one of the caller's own notifications as read."),
  z
    .object({ action: z.literal("mark_all_read"), campaign_id: uuid.optional() })
    .describe("Mark all of the caller's unread notifications as read, optionally by campaign."),
  z
    .object({ action: z.literal("delete_mine"), notification_id: uuid })
    .describe("Delete one of the caller's own notifications."),
]);

async function requireMember(
  ctx: McpToolContext,
  campaignId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await ctx.supabase
    .from("campaign_members")
    .select("user_id")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("Membership lookup", error);
  if (!data) throw new Error("That user is not a member of this campaign.");
}

export function registerCampaignNotifications(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "campaign_notifications",
    {
      title: "Campaign notifications",
      description:
        "Manage the in-app notification bell. Actions: send (deliver a notification to one " +
        "player or to all players at once, GM only, changes data), list_mine (read the caller's " +
        "own notifications), mark_read (mark one of the caller's notifications read, changes " +
        "data), mark_all_read (mark all of the caller's unread notifications read, changes " +
        "data), delete_mine (delete one of the caller's own notifications, deletes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      send: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "send notifications");

        const hasUser = i.user_id !== undefined;
        const hasAll = i.all_players === true;
        if (hasUser === hasAll) {
          throw new Error(
            "Specify exactly one recipient mode: either user_id, or all_players: true — not both, not neither.",
          );
        }

        const kind = i.kind ?? "info";
        const base = {
          campaign_id: i.campaign_id,
          entity_id: i.entity_id ?? null,
          kind,
          title: i.title,
          body: i.body ?? null,
          created_by: ctx.userId,
        };

        let rows: TablesInsert<"notifications">[];
        if (hasUser) {
          const userId = i.user_id as string;
          await requireMember(ctx, i.campaign_id, userId);
          rows = [{ ...base, user_id: userId }];
        } else {
          const { data: members, error: membersError } = await ctx.supabase
            .from("campaign_members")
            .select("user_id")
            .eq("campaign_id", i.campaign_id);
          if (membersError) fail("Listing members", membersError);
          rows = (members ?? [])
            .filter((member) => member.user_id !== campaign.gmId)
            .map((member) => ({ ...base, user_id: member.user_id }));
          if (rows.length === 0) {
            throw new Error("This campaign has no players to notify yet.");
          }
        }

        const { data, error } = await ctx.supabase.from("notifications").insert(rows).select();
        if (error) fail("Sending notifications", error);
        const items = (data ?? []) as Structured[];
        return listReply("notifications sent", items, items.length);
      },

      list_mine: async (i) => {
        let query = ctx.supabase
          .from("notifications")
          .select("*")
          .eq("user_id", ctx.userId)
          .order("created_at", { ascending: false });
        let countQuery = ctx.supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", ctx.userId);
        if (i.campaign_id) {
          query = query.eq("campaign_id", i.campaign_id);
          countQuery = countQuery.eq("campaign_id", i.campaign_id);
        }
        const limit = i.limit ?? 50;
        const { data, error } = await query.limit(limit);
        if (error) fail("Listing notifications", error);
        const { count, error: countError } = await countQuery;
        if (countError) fail("Counting notifications", countError);
        const items = (data ?? []) as Structured[];
        return listReply("notifications", items, count ?? items.length);
      },

      mark_read: async (i) => {
        const { data, error } = await ctx.supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", i.notification_id)
          .eq("user_id", ctx.userId)
          .select()
          .maybeSingle();
        if (error) fail("Marking notification read", error);
        if (!data) throw new Error("Notification not found, or you do not have access to it.");
        return detailReply("Notification marked read.", data as Structured);
      },

      mark_all_read: async (i) => {
        let query = ctx.supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", ctx.userId)
          .is("read_at", null);
        if (i.campaign_id) query = query.eq("campaign_id", i.campaign_id);
        const { data, error } = await query.select();
        if (error) fail("Marking notifications read", error);
        const items = (data ?? []) as Structured[];
        return listReply("notifications marked read", items, items.length);
      },

      delete_mine: async (i) => {
        const { data, error } = await ctx.supabase
          .from("notifications")
          .delete()
          .eq("id", i.notification_id)
          .eq("user_id", ctx.userId)
          .select()
          .maybeSingle();
        if (error) fail("Deleting notification", error);
        if (!data) throw new Error("Notification not found, or you do not have access to it.");
        return deleteReply("Notification deleted.", i.notification_id);
      },
    }),
  );
}
