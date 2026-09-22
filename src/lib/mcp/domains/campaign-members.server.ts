/**
 * Campaign membership: who is in a campaign, invite codes, and GM transfer.
 *
 * There is no separate invite table — the invite code lives directly on the
 * `campaigns` row and is rotated in place by the `rotate_campaign_invite` RPC.
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
  isCampaignMember,
  limitField,
  listReply,
  loadCampaign,
  requireGmFor,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, Structured, ToolRegistrar } from "@/lib/mcp/kit.server";

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("list"), campaign_id: uuid, limit: limitField })
    .describe("List a campaign's members with their role, join date, and display name."),
  z
    .object({ action: z.literal("get_invite"), campaign_id: uuid })
    .describe("Read the campaign's current invite code. GM only."),
  z
    .object({ action: z.literal("rotate_invite"), campaign_id: uuid })
    .describe(
      "Replace the campaign's invite code with a new one, immediately invalidating the old code. GM only.",
    ),
  z
    .object({ action: z.literal("remove"), campaign_id: uuid, user_id: uuid })
    .describe(
      "Remove a member from the campaign. Refuses to remove the current GM — transfer_gm first. GM only.",
    ),
  z
    .object({ action: z.literal("transfer_gm"), campaign_id: uuid, new_gm_user_id: uuid })
    .describe("Hand Game Master control of the campaign to another existing member. GM only."),
  z
    .object({
      action: z.literal("set_role"),
      campaign_id: uuid,
      user_id: uuid,
      role: z.enum(["gm", "player"]),
    })
    .describe(
      "Set a member's role. Setting 'gm' transfers Game Master control (same as transfer_gm). Setting 'player' on the current GM is refused — transfer_gm first. Setting 'player' on an existing player is a no-op. GM only.",
    ),
]);

const GM_TRANSFER_HINT = 'Use the "transfer_gm" action first to hand off the Game Master role.';

interface MemberRow {
  campaign_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

async function requireMember(ctx: McpToolContext, campaignId: string): Promise<void> {
  const member = await isCampaignMember(ctx, campaignId);
  if (!member) throw new Error("You are not a member of this campaign.");
}

async function memberWithProfile(
  ctx: McpToolContext,
  campaignId: string,
  userId: string,
): Promise<Structured> {
  const { data, error } = await ctx.supabase
    .from("campaign_members")
    .select("campaign_id, user_id, role, joined_at")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("Member lookup", error);
  if (!data) throw new Error("That user is not a member of this campaign.");
  const { data: profile, error: profileError } = await ctx.supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) fail("Profile lookup", profileError);
  return { ...data, display_name: profile?.display_name ?? null };
}

async function listMembers(
  ctx: McpToolContext,
  campaignId: string,
  limit: number,
): Promise<Structured[]> {
  const { data, error } = await ctx.supabase
    .from("campaign_members")
    .select("campaign_id, user_id, role, joined_at")
    .eq("campaign_id", campaignId)
    .order("joined_at", { ascending: true })
    .limit(limit);
  if (error) fail("Listing members", error);
  const rows = (data ?? []) as MemberRow[];
  const ids = rows.map((row) => row.user_id);
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles, error: profileError } = await ctx.supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    if (profileError) fail("Profile lookup", profileError);
    for (const profile of profiles ?? []) nameById.set(profile.id, profile.display_name);
  }
  return rows.map((row) => ({ ...row, display_name: nameById.get(row.user_id) ?? null }));
}

export function registerCampaignMembers(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "campaign_members",
    {
      title: "Campaign members",
      description:
        "Manage a campaign's roster. Actions: list (read the member roster), get_invite " +
        "(read the invite code, GM only), rotate_invite (replace the invite code and invalidate " +
        "the old one, GM only, changes data), remove (drop a member from the campaign, GM only, " +
        "deletes data, refuses to remove the current GM), transfer_gm (hand Game Master control " +
        "to another member, GM only, changes data), set_role (change a member's role — 'gm' " +
        "transfers control, 'player' on the GM is refused, 'player' on a player is a no-op, GM " +
        "only, changes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      list: async (i) => {
        await requireMember(ctx, i.campaign_id);
        const limit = i.limit ?? 50;
        const items = await listMembers(ctx, i.campaign_id, limit);
        const { count, error } = await ctx.supabase
          .from("campaign_members")
          .select("user_id", { count: "exact", head: true })
          .eq("campaign_id", i.campaign_id);
        if (error) fail("Counting members", error);
        return listReply("members", items, count ?? items.length);
      },

      get_invite: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "read the invite code");
        const { data, error } = await ctx.supabase
          .from("campaigns")
          .select("invite_code")
          .eq("id", i.campaign_id)
          .maybeSingle();
        if (error) fail("Invite code lookup", error);
        if (!data) throw new Error("Campaign not found, or you do not have access to it.");
        return detailReply(`Invite code for "${campaign.name}".`, {
          campaign_id: i.campaign_id,
          invite_code: data.invite_code,
        });
      },

      rotate_invite: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "rotate the invite code");
        const { data, error } = await ctx.supabase.rpc("rotate_campaign_invite", {
          _campaign: i.campaign_id,
        });
        if (error) fail("Rotating invite code", error);
        return detailReply(
          `New invite code issued for "${campaign.name}"; the previous code no longer works.`,
          { campaign_id: i.campaign_id, invite_code: data },
        );
      },

      remove: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "remove members");
        if (i.user_id === campaign.gmId) {
          throw new Error(`Cannot remove the current Game Master. ${GM_TRANSFER_HINT}`);
        }
        const { error } = await ctx.supabase
          .from("campaign_members")
          .delete()
          .eq("campaign_id", i.campaign_id)
          .eq("user_id", i.user_id);
        if (error) fail("Removing member", error);
        return deleteReply(`Removed member from "${campaign.name}".`, i.user_id);
      },

      transfer_gm: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "transfer Game Master control");
        const { error } = await ctx.supabase.rpc("transfer_campaign_gm", {
          _campaign: i.campaign_id,
          _new_gm: i.new_gm_user_id,
        });
        if (error) fail("Transferring Game Master", error);
        const { data: updated, error: campaignError } = await ctx.supabase
          .from("campaigns")
          .select("id, name, gm_id")
          .eq("id", i.campaign_id)
          .maybeSingle();
        if (campaignError) fail("Campaign lookup", campaignError);
        const members = await listMembers(ctx, i.campaign_id, 200);
        return detailReply(`Game Master control transferred for "${campaign.name}".`, {
          campaign: updated,
          members,
        });
      },

      set_role: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "change member roles");
        if (i.role === "gm") {
          const { error } = await ctx.supabase.rpc("transfer_campaign_gm", {
            _campaign: i.campaign_id,
            _new_gm: i.user_id,
          });
          if (error) fail("Transferring Game Master", error);
          const item = await memberWithProfile(ctx, i.campaign_id, i.user_id);
          return detailReply(`Game Master control transferred for "${campaign.name}".`, item);
        }
        // role === "player"
        if (i.user_id === campaign.gmId) {
          throw new Error(`Cannot demote the current Game Master directly. ${GM_TRANSFER_HINT}`);
        }
        const item = await memberWithProfile(ctx, i.campaign_id, i.user_id);
        return detailReply("Member is already a player; nothing changed.", item);
      },
    }),
  );
}
