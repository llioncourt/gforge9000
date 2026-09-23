/**
 * Entry relationship tools: list_relationships, create_relationship,
 * update_relationship, delete_relationship.
 */
import { z } from "zod/v4";
import type { Database } from "@/integrations/supabase/types";
import { VISIBILITY_VALUES } from "@/lib/visibility";
import {
  CREATE,
  DEFAULT_LIMIT,
  DESTROY,
  MODIFY,
  READ,
  boundedText,
  buildPatch,
  deleteOutput,
  deleteReply,
  detailReply,
  fail,
  itemOutput,
  limitField,
  listOutput,
  listReply,
  loadCampaign,
  requireGm,
  requirePatch,
  safeRpc,
  stripGmFields,
  uuid,
  type McpToolContext,
  type ToolRegistrar,
} from "@/lib/mcp/kit.server";
import {
  GM_ONLY_RELATIONSHIP_FIELDS,
  loadEntity,
  loadRelationship,
  strengthField,
  type RelationshipRow,
} from "@/lib/mcp/domains/shared.server";

export function registerRelationships(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "list_relationships",
    {
      title: "List entry relationships",
      description:
        "Lists the links between entries in one campaign. Game Master descriptions are removed for players. The reply reports how many links were returned out of the exact total.",
      inputSchema: z.object({ campaign_id: uuid, limit: limitField }),
      outputSchema: listOutput,
      annotations: READ,
    },
    async ({ campaign_id, limit }) => {
      const campaign = await loadCampaign(ctx, campaign_id);
      const max = limit ?? DEFAULT_LIMIT;
      const { data, error } = await safeRpc(ctx.supabase)("list_relationships_safe", {
        _campaign: campaign_id,
      })
        .order("created_at", { ascending: true })
        .limit(max);
      if (error) fail("Listing relationships", error);
      const items = ((data ?? []) as RelationshipRow[]).map((row) =>
        stripGmFields(
          row as unknown as Record<string, unknown>,
          campaign.isGm,
          GM_ONLY_RELATIONSHIP_FIELDS,
        ),
      );
      const { count, error: countError } = await safeRpc(ctx.supabase)(
        "list_relationships_safe",
        { _campaign: campaign_id },
        { count: "exact", head: true },
      );
      if (countError) fail("Counting relationships", countError);
      return listReply(
        `relationships in "${campaign.name}"`,
        items,
        typeof count === "number" ? count : items.length,
      );
    },
  );

  tool(
    "create_relationship",
    {
      title: "Link two entries",
      description:
        "Creates a link between two entries of the same campaign. Only the campaign's Game Master can do this.",
      inputSchema: z.object({
        campaign_id: uuid,
        source_id: uuid,
        target_id: uuid,
        rel_type: boundedText(60),
        description: z.string().max(2000).nullable().optional(),
        gm_description: z.string().max(4000).nullable().optional(),
        visibility: z.enum(VISIBILITY_VALUES).optional(),
        strength: strengthField.nullable().optional(),
        is_current: z.boolean().optional(),
        start_label: z.string().max(120).nullable().optional(),
        end_label: z.string().max(120).nullable().optional(),
      }),
      outputSchema: itemOutput,
      annotations: CREATE,
    },
    async ({ campaign_id, source_id, target_id, rel_type, ...optional }) => {
      const campaign = await loadCampaign(ctx, campaign_id);
      requireGm(campaign);
      for (const id of [source_id, target_id]) {
        const { campaign: owner } = await loadEntity(ctx, id);
        if (owner.id !== campaign.id) {
          throw new Error("Both entries must belong to the same campaign.");
        }
      }
      const { data, error } = await ctx.supabase
        .from("entity_relationships")
        .insert({
          campaign_id,
          source_id,
          target_id,
          rel_type,
          ...buildPatch(optional),
        })
        .select("*")
        .single();
      if (error) fail("Creating the relationship", error);
      return detailReply(`Linked the two entries as "${data.rel_type}" (${data.id}).`, data);
    },
  );

  tool(
    "update_relationship",
    {
      title: "Update a link between entries",
      description:
        "Changes an existing link between two entries. Only the campaign's Game Master can do this. Fields left out stay unchanged.",
      inputSchema: z.object({
        relationship_id: uuid,
        rel_type: boundedText(60).optional(),
        description: z.string().max(2000).nullable().optional(),
        gm_description: z.string().max(4000).nullable().optional(),
        visibility: z.enum(VISIBILITY_VALUES).optional(),
        strength: strengthField.nullable().optional(),
        is_current: z.boolean().optional(),
        start_label: z.string().max(120).nullable().optional(),
        end_label: z.string().max(120).nullable().optional(),
      }),
      outputSchema: itemOutput,
      annotations: MODIFY,
    },
    async ({ relationship_id, ...patch }) => {
      const relation = await loadRelationship(ctx, relationship_id);
      requireGm(relation.campaign);
      const update = buildPatch(patch);
      requirePatch(update);
      const { data, error } = await ctx.supabase
        .from("entity_relationships")
        .update(update as Database["public"]["Tables"]["entity_relationships"]["Update"])
        .eq("id", relationship_id)
        .select("*")
        .single();
      if (error) fail("Updating the relationship", error);
      return detailReply(`Updated the "${data.rel_type}" link (${data.id}).`, data);
    },
  );

  tool(
    "delete_relationship",
    {
      title: "Remove a link between entries",
      description:
        "Permanently removes a link between two entries. Only the campaign's Game Master can do this.",
      inputSchema: z.object({ relationship_id: uuid }),
      outputSchema: deleteOutput,
      annotations: DESTROY,
    },
    async ({ relationship_id }) => {
      const relation = await loadRelationship(ctx, relationship_id);
      requireGm(relation.campaign);
      const { data, error } = await ctx.supabase
        .from("entity_relationships")
        .delete()
        .eq("id", relationship_id)
        .select("id");
      if (error) fail("Deleting the relationship", error);
      if (!data || data.length === 0) throw new Error("The link was not deleted.");
      return deleteReply(`Removed the "${relation.row.rel_type}" link.`, relationship_id);
    },
  );
}
