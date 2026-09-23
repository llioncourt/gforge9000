/** Campaign CRUD tools: list_campaigns, get_campaign, create_campaign, update_campaign, delete_campaign. */
import { z } from "zod/v4";
import type { Database } from "@/integrations/supabase/types";
import {
  CREATE,
  DEFAULT_LIMIT,
  DESTROY,
  MODIFY,
  READ,
  boundedText,
  buildPatch,
  detailReply,
  fail,
  itemOutput,
  limitField,
  listOutput,
  listReply,
  loadCampaign,
  reply,
  requireGm,
  requirePatch,
  safeRpc,
  uuid,
  type McpToolContext,
  type Structured,
  type ToolRegistrar,
} from "@/lib/mcp/kit.server";
import { campaignSettingFields, campaignSettingsPatch, SETTINGS_DOC } from "@/lib/mcp/domains/shared.server";

const deleteCampaignOutput = z.object({
  deleted: z.boolean(),
  id: z.string(),
  entries_deleted: z.number().int(),
  relationships_deleted: z.number().int(),
  characters_deleted: z.number().int(),
  characters_unlinked: z.number().int(),
});

export function registerCampaigns(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "list_campaigns",
    {
      title: "List campaigns",
      description:
        "Lists the campaigns the signed-in account can see: the ones they run as Game Master and the ones they have joined as a player. The reply reports how many were returned out of the exact total.",
      inputSchema: z.object({ limit: limitField }),
      outputSchema: listOutput,
      annotations: READ,
    },
    async ({ limit }) => {
      const max = limit ?? DEFAULT_LIMIT;
      const { data, error } = await ctx.supabase
        .from("campaigns")
        .select("id, name, description, gm_id, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(max);
      if (error) fail("Listing campaigns", error);
      const items = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        is_gm: row.gm_id === ctx.userId,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
      const { count, error: countError } = await ctx.supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true });
      if (countError) fail("Counting campaigns", countError);
      return listReply("campaigns", items, typeof count === "number" ? count : items.length);
    },
  );

  tool(
    "get_campaign",
    {
      title: "Get a campaign",
      description:
        "Reads one campaign in full: its name, premise, settings, the caller's role in it, its members, and exact counts of its entries, links and character sheets. What is returned follows the campaign's own permissions — the campaign must be one the signed-in account can see.",
      inputSchema: z.object({ campaign_id: uuid }),
      outputSchema: itemOutput,
      annotations: READ,
    },
    async ({ campaign_id }) => {
      const { data: row, error } = await ctx.supabase
        .from("campaigns")
        .select("*")
        .eq("id", campaign_id)
        .maybeSingle();
      if (error) fail("Campaign lookup", error);
      if (!row) throw new Error("Campaign not found, or you do not have access to it.");
      const isGm = row.gm_id === ctx.userId;

      const { data: memberRows, error: memberError } = await ctx.supabase
        .from("campaign_members")
        .select("user_id, role, joined_at")
        .eq("campaign_id", campaign_id);
      if (memberError) fail("Listing campaign members", memberError);
      const ids = (memberRows ?? []).map((m) => m.user_id);
      let profiles: { id: string; display_name: string }[] = [];
      if (ids.length > 0) {
        const { data: profileRows, error: profileError } = await ctx.supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", ids);
        if (profileError) fail("Reading member profiles", profileError);
        profiles = profileRows ?? [];
      }
      const members = (memberRows ?? []).map((m) => ({
        user_id: m.user_id,
        display_name: profiles.find((p) => p.id === m.user_id)?.display_name ?? "Player",
        role: m.role,
        joined_at: m.joined_at,
      }));

      const counts = await Promise.all(
        (["entities", "entity_relationships", "characters"] as const).map(async (table) => {
          const { count, error: countError } = await ctx.supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign_id);
          if (countError) fail(`Counting ${table}`, countError);
          return typeof count === "number" ? count : 0;
        }),
      );

      const item: Structured = {
        ...row,
        user_role: isGm ? "gm" : "player",
        members,
        entries_count: counts[0],
        relationships_count: counts[1],
        characters_count: counts[2],
      };
      return detailReply(`Campaign "${row.name}" — role: ${isGm ? "gm" : "player"}.`, item);
    },
  );

  tool(
    "create_campaign",
    {
      title: "Create a campaign",
      description: `Creates a new campaign owned by the signed-in account, who becomes its Game Master. ${SETTINGS_DOC}`,
      inputSchema: z.object({
        name: boundedText(120),
        description: z.string().max(4000).nullable().optional(),
        ...campaignSettingFields,
      }),
      outputSchema: itemOutput,
      annotations: CREATE,
    },
    async (input) => {
      const { data, error } = await safeRpc(ctx.supabase)("mcp_create_campaign", {
        _name: input.name,
        _description: input.description ?? null,
        _settings_patch: campaignSettingsPatch(input as Record<string, unknown>),
      });
      if (error) fail("Creating the campaign", error);
      const row = data as Database["public"]["Tables"]["campaigns"]["Row"];
      return detailReply(`Created campaign "${row.name}" (${row.id}).`, row);
    },
  );

  tool(
    "update_campaign",
    {
      title: "Update a campaign",
      description: `Changes the name, premise or settings of a campaign. Only the campaign's Game Master can edit it. Fields left out stay unchanged. ${SETTINGS_DOC}`,
      inputSchema: z.object({
        campaign_id: uuid,
        name: boundedText(120).optional(),
        description: z.string().max(4000).nullable().optional(),
        ...campaignSettingFields,
      }),
      outputSchema: itemOutput,
      annotations: MODIFY,
    },
    async ({ campaign_id, name, description, ...rest }) => {
      const campaign = await loadCampaign(ctx, campaign_id);
      requireGm(campaign);
      const patch = buildPatch({ name, description });
      const settingsPatch = campaignSettingsPatch(rest as Record<string, unknown>);
      requirePatch({ ...patch, ...settingsPatch });
      const { data, error } = await safeRpc(ctx.supabase)("mcp_update_campaign", {
        _campaign: campaign_id,
        _patch: patch,
        _settings_patch: settingsPatch,
      });
      if (error) fail("Updating the campaign", error);
      const row = data as Database["public"]["Tables"]["campaigns"]["Row"];
      return detailReply(`Updated campaign "${row.name}" (${row.id}).`, row);
    },
  );

  tool(
    "delete_campaign",
    {
      title: "Delete a campaign",
      description:
        "Permanently deletes a campaign and everything that belongs to it — entries, links, notes, maps, sessions, media and members. This cannot be undone. Only the campaign's Game Master can do it, and `confirm_name` must repeat the campaign's current name exactly, including capitalisation. Character sheets owned by the Game Master are deleted with the campaign; sheets owned by other players are kept and simply detached from it.",
      inputSchema: z.object({ campaign_id: uuid, confirm_name: z.string().max(200) }),
      outputSchema: deleteCampaignOutput,
      annotations: DESTROY,
    },
    async ({ campaign_id, confirm_name }) => {
      const campaign = await loadCampaign(ctx, campaign_id);
      if (campaign.gmId !== ctx.userId) {
        throw new Error(`Only the Game Master of "${campaign.name}" can delete this campaign.`);
      }
      if (confirm_name !== campaign.name) {
        throw new Error(`Confirmation name does not match. Expected: "${campaign.name}".`);
      }
      const { data, error } = await safeRpc(ctx.supabase)("mcp_delete_campaign", {
        _campaign: campaign_id,
        _confirm_name: confirm_name,
      });
      if (error) fail("Deleting the campaign", error);
      const payload = data as Structured;
      return reply(
        `Deleted campaign "${campaign.name}" permanently.\n\n${JSON.stringify(payload, null, 2)}`,
        payload,
      );
    },
  );
}
