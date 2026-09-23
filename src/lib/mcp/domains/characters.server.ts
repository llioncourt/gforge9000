/**
 * Character sheet CRUD tools: list_characters, get_character,
 * create_character, update_character, delete_character.
 */
import { z } from "zod/v4";
import type { Database } from "@/integrations/supabase/types";
import {
  CREATE,
  DEFAULT_LIMIT,
  DESTROY,
  MCP_MAX_LIMIT,
  MODIFY,
  READ,
  boundedText,
  buildPatch,
  characterView,
  deleteOutput,
  deleteReply,
  detailReply,
  fail,
  itemOutput,
  limitField,
  listOutput,
  listReply,
  loadCampaign,
  loadCharacter,
  requireCharacterOwner,
  requireCharacterWrite,
  requirePatch,
  uuid,
  type McpToolContext,
  type ToolRegistrar,
} from "@/lib/mcp/kit.server";
import { characterWritableFields, compactEntryNotes } from "@/lib/mcp/domains/shared.server";

export function registerCharacters(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "list_characters",
    {
      title: "List characters",
      description:
        "Lists the character sheets the signed-in account can see, optionally limited to one campaign. The reply reports how many sheets were returned out of the exact total matching the same filter.",
      inputSchema: z.object({ campaign_id: uuid.optional(), limit: limitField }),
      outputSchema: listOutput,
      annotations: READ,
    },
    async ({ campaign_id, limit }) => {
      const max = limit ?? DEFAULT_LIMIT;
      let query = ctx.supabase
        .from("characters")
        .select(
          "id, name, concept, campaign_id, owner_id, is_npc, is_template, point_budget, tech_level, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(max);
      if (campaign_id) query = query.eq("campaign_id", campaign_id);
      const { data, error } = await query;
      if (error) fail("Listing characters", error);
      const items = (data ?? []).map((row) => ({
        ...row,
        is_owner: row.owner_id === ctx.userId,
      }));
      let countQuery = ctx.supabase.from("characters").select("id", { count: "exact", head: true });
      if (campaign_id) countQuery = countQuery.eq("campaign_id", campaign_id);
      const { count, error: countError } = await countQuery;
      if (countError) fail("Counting characters", countError);
      return listReply("characters", items, typeof count === "number" ? count : items.length);
    },
  );

  tool(
    "get_character",
    {
      title: "Get a character sheet",
      description:
        "Reads one character sheet with its entries (traits, skills, equipment). Game Master notes are only included for the sheet's owner or their campaign's Game Master.",
      inputSchema: z.object({
        character_id: uuid,
        entry_limit: limitField,
        compact: z.boolean().optional(),
      }),
      outputSchema: itemOutput,
      annotations: READ,
    },
    async ({ character_id, entry_limit, compact }) => {
      const access = await loadCharacter(ctx, character_id);
      const max = entry_limit ?? MCP_MAX_LIMIT;
      const { data, error } = await ctx.supabase
        .from("character_entries")
        .select("id, kind, name, category, points, levels, notes, sort_order")
        .eq("character_id", character_id)
        .order("kind")
        .order("sort_order")
        .order("name")
        .limit(max);
      if (error) fail("Loading character entries", error);
      const rows = data ?? [];
      const returned = rows.length;
      const { count, error: countError } = await ctx.supabase
        .from("character_entries")
        .select("id", { count: "exact", head: true })
        .eq("character_id", character_id);
      if (countError) fail("Counting character entries", countError);
      const total = typeof count === "number" ? count : returned;
      const entries = compact === true ? rows.map(compactEntryNotes) : rows;
      const header =
        returned < total
          ? `Character "${access.row.name}" — showing ${returned} of ${total} entries (more may exist — raise entry_limit).`
          : `Character "${access.row.name}" — showing ${returned} of ${total} entries.`;
      const item = { ...characterView(access), entries };
      return detailReply(header, item);
    },
  );

  tool(
    "create_character",
    {
      title: "Create a character",
      description:
        "Creates a new character sheet owned by the signed-in account. Fields left out keep their normal defaults.",
      inputSchema: z.object({ name: boundedText(120), ...characterWritableFields }),
      outputSchema: itemOutput,
      annotations: CREATE,
    },
    async ({ name, ...rest }) => {
      if (rest.campaign_id) await loadCampaign(ctx, rest.campaign_id);
      const { data, error } = await ctx.supabase
        .from("characters")
        .insert({
          name,
          owner_id: ctx.userId,
          ...(buildPatch(rest) as Database["public"]["Tables"]["characters"]["Insert"]),
        })
        .select("*")
        .single();
      if (error) fail("Creating the character", error);
      return detailReply(
        `Created character "${data.name}" (${data.id}).`,
        characterView({ row: data, isOwner: true, isGm: false }),
      );
    },
  );

  tool(
    "update_character",
    {
      title: "Update a character",
      description:
        "Changes fields on an existing character sheet. Only the sheet's owner or their campaign's Game Master can edit it. Fields left out stay unchanged. When supplied, `appearance` and `conditions` replace the entire stored object/array rather than being merged. Read the character first and resend any existing keys/items you want to preserve. `campaign_id` is restricted: once a sheet belongs to a campaign, only that campaign's Game Master can move it to another campaign or detach it — the owner cannot. A sheet that belongs to no campaign can be attached by its owner wherever they are allowed to.",
      inputSchema: z.object({ character_id: uuid, ...characterWritableFields }),
      outputSchema: itemOutput,
      annotations: MODIFY,
    },
    async ({ character_id, ...patch }) => {
      const access = await loadCharacter(ctx, character_id);
      requireCharacterWrite(access);
      const update = buildPatch(patch);
      requirePatch(update);
      if (patch.campaign_id) await loadCampaign(ctx, patch.campaign_id);
      const { data, error } = await ctx.supabase
        .from("characters")
        .update(update as Database["public"]["Tables"]["characters"]["Update"])
        .eq("id", character_id)
        .select("*")
        .single();
      if (error) fail("Updating the character", error);
      return detailReply(
        `Updated character "${data.name}" (${data.id}).`,
        characterView({ ...access, row: data }),
      );
    },
  );

  tool(
    "delete_character",
    {
      title: "Delete a character",
      description:
        "Permanently removes a character sheet and everything on it. Only the sheet's owner can delete it — not the campaign's Game Master.",
      inputSchema: z.object({ character_id: uuid }),
      outputSchema: deleteOutput,
      annotations: DESTROY,
    },
    async ({ character_id }) => {
      const access = await loadCharacter(ctx, character_id);
      requireCharacterOwner(access);
      const { data, error } = await ctx.supabase
        .from("characters")
        .delete()
        .eq("id", character_id)
        .select("id");
      if (error) fail("Deleting the character", error);
      if (!data || data.length === 0) throw new Error("The character was not deleted.");
      return deleteReply(`Deleted character "${access.row.name}".`, character_id);
    },
  );
}
