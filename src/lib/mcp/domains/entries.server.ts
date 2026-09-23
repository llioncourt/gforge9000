/**
 * Entry-type catalogue and world/story entry CRUD tools: list_entry_types,
 * list_entries, get_entry, create_entry, update_entry, delete_entry.
 */
import { z } from "zod/v4";
import type { Database, Json } from "@/integrations/supabase/types";
import { KINDS } from "@/lib/entity-kinds";
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
  intField,
  itemOutput,
  limitField,
  listOutput,
  listReply,
  loadCampaign,
  reply,
  requireGm,
  requirePatch,
  safeRpc,
  stripGmFields,
  uuid,
  type McpToolContext,
  type ToolRegistrar,
} from "@/lib/mcp/kit.server";
import {
  GM_ONLY_ENTITY_FIELDS,
  assertParentIsSafe,
  canonicalStatus,
  entitySummary,
  kindDef,
  loadEntity,
  type EntityRow,
} from "@/lib/mcp/domains/shared.server";

const listEntryTypesInput = z.object({});
const listEntriesInput = z.object({
  campaign_id: uuid,
  kind: z.string().max(40).optional(),
  search: z.string().max(200).optional(),
  limit: limitField,
});
const getEntryInput = z.object({ entry_id: uuid });
const createEntryInput = z.object({
  campaign_id: uuid,
  kind: boundedText(40),
  name: boundedText(200),
  summary: z.string().max(2000).optional(),
  description: z.string().max(20000).optional(),
  gm_notes: z.string().max(20000).optional(),
  status: z.string().max(60).optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  parent_id: uuid.optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
const updateEntryInput = z.object({
  entry_id: uuid,
  kind: boundedText(40).optional(),
  name: boundedText(200).optional(),
  summary: z.string().max(2000).nullable().optional(),
  player_description: z.string().max(20000).nullable().optional(),
  description: z.string().max(20000).nullable().optional(),
  gm_notes: z.string().max(20000).nullable().optional(),
  status: z.string().max(60).optional(),
  visibility: z.enum(VISIBILITY_VALUES).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  aliases: z.array(z.string().max(120)).max(50).optional(),
  parent_id: uuid.nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
const deleteEntryInput = z.object({ entry_id: uuid });

export function registerEntries(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "list_entry_types",
    {
      title: "List entry types",
      description:
        "Lists every kind of world or story entry a campaign can hold, with the exact statuses each kind accepts and its default status. The full list is included in the reply text as well as in the structured result. Use the returned `kind` value with the entry tools.",
      inputSchema: listEntryTypesInput,
      outputSchema: listOutput,
      annotations: READ,
    },
    async () => {
      const items = KINDS.map((kind) => ({
        kind: kind.kind,
        label: kind.label,
        plural: kind.plural,
        group: kind.group,
        statuses: kind.statuses,
        default_status: kind.defaultStatus,
        nestable: kind.nestable === true,
      }));
      return listReply("entry types", items, items.length);
    },
  );

  tool(
    "list_entries",
    {
      title: "List campaign entries",
      description:
        "Lists the world and story entries of one campaign that the signed-in account is allowed to see. Game Master notes are removed for players. The reply reports how many entries were returned out of the exact total matching the same filters.",
      inputSchema: listEntriesInput,
      outputSchema: listOutput,
      annotations: READ,
    },
    async ({ campaign_id, kind, search, limit }) => {
      const campaign = await loadCampaign(ctx, campaign_id);
      const max = limit ?? DEFAULT_LIMIT;
      const filtered = (builder: ReturnType<ReturnType<typeof safeRpc>>) => {
        let query = builder;
        if (kind) query = query.eq("kind", kind);
        if (search) query = query.ilike("name", `%${search}%`);
        return query;
      };
      const { data, error } = await filtered(
        safeRpc(ctx.supabase)("list_entities_safe", { _campaign: campaign_id })
          .order("kind", { ascending: true })
          .order("name", { ascending: true })
          .limit(max),
      );
      if (error) fail("Listing entries", error);
      const items = ((data ?? []) as EntityRow[]).map(entitySummary);
      const { count, error: countError } = await filtered(
        safeRpc(ctx.supabase)(
          "list_entities_safe",
          { _campaign: campaign_id },
          { count: "exact", head: true },
        ),
      );
      if (countError) fail("Counting entries", countError);
      return listReply(
        `entries in "${campaign.name}"`,
        items,
        typeof count === "number" ? count : items.length,
      );
    },
  );

  tool(
    "get_entry",
    {
      title: "Get a campaign entry",
      description:
        "Reads one world or story entry in full. Game Master notes and GM-only fields are removed for players.",
      inputSchema: getEntryInput,
      outputSchema: itemOutput,
      annotations: READ,
    },
    async ({ entry_id }) => {
      const { row, campaign } = await loadEntity(ctx, entry_id);
      const item = stripGmFields(
        row as unknown as Record<string, unknown>,
        campaign.isGm,
        GM_ONLY_ENTITY_FIELDS,
      );
      return reply(
        `${row.kind} "${row.name}" in "${campaign.name}".\n\n${JSON.stringify(item, null, 2)}`,
        { item },
      );
    },
  );

  tool(
    "create_entry",
    {
      title: "Create a campaign entry",
      description:
        "Adds a world or story entry to a campaign. Only the campaign's Game Master can do this. `kind` must be one of the kinds from list_entry_types. `status` is matched against that kind's own statuses ignoring capitalisation and stored in the app's exact spelling; leave it out to get that kind's default status.",
      inputSchema: createEntryInput,
      outputSchema: itemOutput,
      annotations: CREATE,
    },
    async (input) => {
      const campaign = await loadCampaign(ctx, input.campaign_id);
      requireGm(campaign);
      const def = kindDef(input.kind);
      const status = input.status ? canonicalStatus(input.kind, input.status) : def.defaultStatus;
      const { data, error } = await ctx.supabase
        .from("entities")
        .insert({
          campaign_id: input.campaign_id,
          kind: input.kind,
          name: input.name,
          summary: input.summary ?? null,
          description: input.description ?? null,
          gm_notes: input.gm_notes ?? null,
          status,
          ...(input.visibility ? { visibility: input.visibility } : {}),
          ...(input.tags ? { tags: input.tags } : {}),
          parent_id: input.parent_id ?? null,
          ...(input.data ? { data: input.data as Json } : {}),
        })
        .select("*")
        .single();
      if (error) fail("Creating the entry", error);
      return detailReply(`Created ${data.kind} "${data.name}" (${data.id}).`, data);
    },
  );

  tool(
    "update_entry",
    {
      title: "Update a campaign entry",
      description:
        "Changes fields on an existing world or story entry. Only the campaign's Game Master can do this. Fields left out are untouched. When supplied, `data`, `aliases`, and `tags` replace the entire stored object/array rather than being merged. Read the entry first and resend any existing keys/items you want to preserve. `status` is matched against the kind's own statuses ignoring capitalisation and stored in the app's exact spelling; if you change `kind` and the current status does not exist for the new kind, supply a valid one.",
      inputSchema: updateEntryInput,
      outputSchema: itemOutput,
      annotations: MODIFY,
    },
    async ({ entry_id, ...patch }) => {
      const { row, campaign } = await loadEntity(ctx, entry_id);
      requireGm(campaign);

      const effectiveKind = patch.kind ?? row.kind;
      if (patch.kind !== undefined) kindDef(patch.kind);
      if (patch.status !== undefined || patch.kind !== undefined) {
        const effectiveStatus = patch.status ?? row.status;
        if (effectiveStatus) patch.status = canonicalStatus(effectiveKind, effectiveStatus);
      }
      if (patch.parent_id) {
        await assertParentIsSafe(ctx, entry_id, patch.parent_id, row.campaign_id);
      }

      const update = buildPatch(patch) as Database["public"]["Tables"]["entities"]["Update"];
      requirePatch(update);
      const { data, error } = await ctx.supabase
        .from("entities")
        .update(update)
        .eq("id", entry_id)
        .select("*")
        .single();
      if (error) fail("Updating the entry", error);
      return detailReply(`Updated ${data.kind} "${data.name}" (${data.id}).`, data);
    },
  );

  tool(
    "delete_entry",
    {
      title: "Delete a campaign entry",
      description:
        "Permanently removes a world or story entry. Only the campaign's Game Master can do this.",
      inputSchema: deleteEntryInput,
      outputSchema: deleteOutput,
      annotations: DESTROY,
    },
    async ({ entry_id }) => {
      const { row, campaign } = await loadEntity(ctx, entry_id);
      requireGm(campaign);
      const { data, error } = await ctx.supabase
        .from("entities")
        .delete()
        .eq("id", entry_id)
        .select("id");
      if (error) fail("Deleting the entry", error);
      if (!data || data.length === 0) throw new Error("The entry was not deleted.");
      return deleteReply(`Deleted ${row.kind} "${row.name}".`, entry_id);
    },
  );
}
