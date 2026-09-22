/**
 * Tool surface exposed to external assistants over MCP.
 *
 * Every tool runs against the RLS-scoped Supabase client built from the
 * caller's own access token — there is no service-role access anywhere in this
 * file. On top of RLS, the application's own Game Master / owner rules are
 * checked explicitly so a write never depends on a policy alone.
 *
 * Reads of campaign world data go through `list_entities_safe` /
 * `list_relationships_safe`, the same security-definer functions the app uses,
 * which strip GM-only notes and GM-only data keys for non-GM callers.
 */

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import type { Database, Json } from "@/integrations/supabase/types";
import { KINDS } from "@/lib/entity-kinds";
import { VISIBILITY_VALUES } from "@/lib/visibility";
import {
  CREATE,
  DESTROY,
  DEFAULT_LIMIT,
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
  intField,
  itemOutput,
  limitField,
  listOutput,
  listReply,
  loadCampaign,
  loadCharacter,
  quarterStep,
  registrar,
  reply,
  requireCharacterOwner,
  requireCharacterWrite,
  requireGm,
  requirePatch,
  safeRpc,
  stripGmFields,
  uuid,
} from "@/lib/mcp/kit.server";
import type {
  CampaignAccess,
  CharacterAccess,
  McpToolContext,
  Structured,
} from "@/lib/mcp/kit.server";
import { registerDomainTools, DOMAIN_TOOL_NAMES } from "@/lib/mcp/domains/index.server";

export const MCP_SERVER_NAME = "universal-character-forge";
export const MCP_SERVER_VERSION = "2.0.0";

export { MCP_MAX_LIMIT } from "@/lib/mcp/kit.server";
export type { McpToolContext } from "@/lib/mcp/kit.server";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const deleteCampaignOutput = z.object({
  deleted: z.boolean(),
  id: z.string(),
  entries_deleted: z.number().int(),
  relationships_deleted: z.number().int(),
  characters_deleted: z.number().int(),
  characters_unlinked: z.number().int(),
});

const strengthField = intField(-5, 5, "strength");

/* ---------------- campaign settings ---------------- */

/**
 * The first-level campaign settings the app itself edits, each exposed as its
 * own parameter. Omitted keeps the current value, a value replaces the whole
 * setting, and `null` removes the key so the app falls back to its default.
 */
const campaignSettingFields = {
  point_limit: intField(0, 100000, "point_limit").nullable().optional(),
  disadvantage_limit: intField(-100000, 0, "disadvantage_limit").nullable().optional(),
  tech_level: intField(0, 20, "tech_level").nullable().optional(),
  house_rules: z.string().max(20000).nullable().optional(),
  allowed_packs: z.array(z.string().max(120)).max(500).nullable().optional(),
  cover_path: z.string().max(400).nullable().optional(),
  ruleset_overrides: z.record(z.string(), z.unknown()).nullable().optional(),
} as const;

const CAMPAIGN_SETTING_KEYS = Object.keys(
  campaignSettingFields,
) as (keyof typeof campaignSettingFields)[];

/**
 * Builds the first-level settings patch sent to the atomic database helper:
 * only keys the caller actually supplied, with explicit `null` preserved as a
 * removal instruction. Nested values are passed through untouched.
 */
function campaignSettingsPatch(input: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of CAMPAIGN_SETTING_KEYS) {
    if (key in input && input[key] !== undefined) patch[key] = input[key] ?? null;
  }
  return patch;
}

const SETTINGS_DOC =
  "Each campaign setting is an independent parameter: leave one out to keep its current value (or its normal default on a new campaign), send a value to replace that whole setting, or send null to remove it so the app falls back to its default. Objects and arrays are replaced wholesale, never merged.";

/** GM-only columns that must never reach a non-GM caller. */
const GM_ONLY_ENTITY_FIELDS = ["gm_notes"] as const;
const GM_ONLY_RELATIONSHIP_FIELDS = ["gm_description"] as const;

type EntityRow = Database["public"]["Tables"]["entities"]["Row"];
type RelationshipRow = Database["public"]["Tables"]["entity_relationships"]["Row"];

const ENTITY_SUMMARY_FIELDS = [
  "id",
  "campaign_id",
  "kind",
  "name",
  "status",
  "visibility",
  "summary",
  "tags",
  "parent_id",
  "updated_at",
] as const;

function entitySummary(row: EntityRow): Structured {
  const out: Structured = {};
  for (const field of ENTITY_SUMMARY_FIELDS) out[field] = row[field];
  return out;
}

async function loadEntity(
  ctx: McpToolContext,
  entryId: string,
): Promise<{ row: EntityRow; campaign: CampaignAccess }> {
  const { data, error } = await safeRpc(ctx.supabase)("list_entities_safe")
    .eq("id", entryId)
    .maybeSingle();
  if (error) fail("Entry lookup", error);
  if (!data) throw new Error("Entry not found, or you do not have access to it.");
  const row = data as EntityRow;
  const campaign = await loadCampaign(ctx, row.campaign_id);
  return { row, campaign };
}

/** Longest parent chain we are willing to walk before refusing the move. */
const MAX_PARENT_DEPTH = 64;

function kindDef(kind: string) {
  const found = KINDS.find((entry) => entry.kind === kind);
  if (!found) {
    throw new Error(
      `Unknown entry kind "${kind}". Use list_entry_types to see the kinds this app accepts.`,
    );
  }
  return found;
}

/**
 * Matches a status against the kind's own catalogue, ignoring case, and gives
 * back the exact spelling the app uses for that kind.
 */
function canonicalStatus(kind: string, status: string): string {
  const def = kindDef(kind);
  const match = def.statuses.find((value) => value.toLowerCase() === status.toLowerCase());
  if (!match) {
    throw new Error(
      `Status "${status}" is not valid for ${kind}. Valid statuses: ${def.statuses.join(", ")}.`,
    );
  }
  return match;
}

/**
 * Rejects a parent that would create a loop. Walks the proposed parent's own
 * ancestors with bounded plain queries — no recursive SQL, no schema changes.
 */
async function assertParentIsSafe(
  ctx: McpToolContext,
  entryId: string,
  parentId: string,
  campaignId: string,
): Promise<void> {
  if (parentId === entryId) throw new Error("An entry cannot be its own parent.");
  const seen = new Set<string>([entryId]);
  let cursor: string | null = parentId;
  for (let depth = 0; depth < MAX_PARENT_DEPTH && cursor; depth += 1) {
    const currentId: string = cursor;
    const { data, error } = await ctx.supabase
      .from("entities")
      .select("id, campaign_id, parent_id")
      .eq("id", currentId)
      .maybeSingle();

    if (error) fail("Parent lookup", error);
    if (!data) throw new Error("Parent entry not found, or you do not have access to it.");
    if (data.campaign_id !== campaignId) {
      throw new Error("The parent entry must belong to the same campaign.");
    }
    if (seen.has(data.id) && data.id !== parentId) {
      throw new Error("That parent would create a loop in the entry hierarchy.");
    }
    if (data.parent_id === entryId) {
      throw new Error("That parent would create a loop in the entry hierarchy.");
    }
    if (data.parent_id && seen.has(data.parent_id)) {
      throw new Error("That parent would create a loop in the entry hierarchy.");
    }
    seen.add(data.id);
    cursor = data.parent_id;
  }
  if (cursor) throw new Error("The entry hierarchy is too deep to verify this move safely.");
}

async function loadRelationship(
  ctx: McpToolContext,
  relationshipId: string,
): Promise<{ row: RelationshipRow; campaign: CampaignAccess }> {
  const { data, error } = await ctx.supabase
    .from("entity_relationships")
    .select("*")
    .eq("id", relationshipId)
    .maybeSingle();
  if (error) fail("Relationship lookup", error);
  if (!data) throw new Error("Link not found, or you do not have access to it.");
  const campaign = await loadCampaign(ctx, data.campaign_id);
  return { row: data, campaign };
}

/** Every character column an assistant may write, shared by create and update. */
const characterWritableFields = {
  concept: z.string().max(400).nullable().optional(),
  player_name: z.string().max(120).nullable().optional(),
  campaign_id: uuid.nullable().optional(),
  is_npc: z.boolean().optional(),
  point_budget: intField(0, 100000, "point_budget").optional(),
  tech_level: intField(0, 20, "tech_level").optional(),
  st: intField(0, 1000, "st").optional(),
  dx: intField(0, 1000, "dx").optional(),
  iq: intField(0, 1000, "iq").optional(),
  ht: intField(0, 1000, "ht").optional(),
  hp_delta: intField(-1000, 1000, "hp_delta").optional(),
  will_delta: intField(-1000, 1000, "will_delta").optional(),
  per_delta: intField(-1000, 1000, "per_delta").optional(),
  fp_delta: intField(-1000, 1000, "fp_delta").optional(),
  speed_delta: quarterStep.optional(),
  move_delta: intField(-1000, 1000, "move_delta").optional(),
  current_hp: intField(-10000, 10000, "current_hp").nullable().optional(),
  current_fp: intField(-10000, 10000, "current_fp").nullable().optional(),
  conditions: z.array(z.string().max(80)).max(100).optional(),
  wealth: z.string().max(60).optional(),
  status: intField(-20, 20, "status").optional(),
  appearance: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(20000).nullable().optional(),
  gm_notes: z.string().max(20000).nullable().optional(),
} as const;

/** Compact mode shortens long entry notes in the reply only — never in the DB. */
const COMPACT_NOTES_LIMIT = 200;

function compactEntryNotes<T extends { notes?: string | null }>(row: T): T {
  const notes = row.notes;
  if (typeof notes !== "string" || notes.length <= COMPACT_NOTES_LIMIT) return row;
  return { ...row, notes: `${notes.slice(0, COMPACT_NOTES_LIMIT - 1).trimEnd()}…` };
}

/* ------------------------------------------------------------------ */
/* Server construction                                                 */
/* ------------------------------------------------------------------ */

export function buildMcpServer(ctx: McpToolContext): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    title: "Universal Character Forge",
  });

  const read = READ;
  const create = CREATE;
  const modify = MODIFY;
  const destroy = DESTROY;

  const tool = registrar(server);

  /* ---------------- campaigns ---------------- */

  tool(
    "list_campaigns",
    {
      title: "List campaigns",
      description:
        "Lists the campaigns the signed-in account can see: the ones they run as Game Master and the ones they have joined as a player. The reply reports how many were returned out of the exact total.",
      inputSchema: z.object({ limit: limitField }),
      outputSchema: listOutput,
      annotations: read,
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
      annotations: read,
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
      annotations: create,
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
      annotations: modify,
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
      annotations: destroy,
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

  /* ---------------- entry types ---------------- */

  tool(
    "list_entry_types",
    {
      title: "List entry types",
      description:
        "Lists every kind of world or story entry a campaign can hold, with the exact statuses each kind accepts and its default status. The full list is included in the reply text as well as in the structured result. Use the returned `kind` value with the entry tools.",
      inputSchema: z.object({}),
      outputSchema: listOutput,
      annotations: read,
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

  /* ---------------- entries ---------------- */

  tool(
    "list_entries",
    {
      title: "List campaign entries",
      description:
        "Lists the world and story entries of one campaign that the signed-in account is allowed to see. Game Master notes are removed for players. The reply reports how many entries were returned out of the exact total matching the same filters.",
      inputSchema: z.object({
        campaign_id: uuid,
        kind: z.string().max(40).optional(),
        search: z.string().max(200).optional(),
        limit: limitField,
      }),
      outputSchema: listOutput,
      annotations: read,
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
      inputSchema: z.object({ entry_id: uuid }),
      outputSchema: itemOutput,
      annotations: read,
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
      inputSchema: z.object({
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
      }),
      outputSchema: itemOutput,
      annotations: create,
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
      inputSchema: z.object({
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
      }),
      outputSchema: itemOutput,
      annotations: modify,
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
      inputSchema: z.object({ entry_id: uuid }),
      outputSchema: deleteOutput,
      annotations: destroy,
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

  /* ---------------- relationships ---------------- */

  tool(
    "list_relationships",
    {
      title: "List entry relationships",
      description:
        "Lists the links between entries in one campaign. Game Master descriptions are removed for players. The reply reports how many links were returned out of the exact total.",
      inputSchema: z.object({ campaign_id: uuid, limit: limitField }),
      outputSchema: listOutput,
      annotations: read,
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
      annotations: create,
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
      annotations: modify,
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
      annotations: destroy,
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

  /* ---------------- characters ---------------- */

  tool(
    "list_characters",
    {
      title: "List characters",
      description:
        "Lists the character sheets the signed-in account can see, optionally limited to one campaign. The reply reports how many sheets were returned out of the exact total matching the same filter.",
      inputSchema: z.object({ campaign_id: uuid.optional(), limit: limitField }),
      outputSchema: listOutput,
      annotations: read,
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
      annotations: read,
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
      annotations: create,
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
      annotations: modify,
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
      annotations: destroy,
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

  tool(
    "add_character_entry",
    {
      title: "Add an entry to a character",
      description:
        "Adds one trait, skill, technique or piece of equipment to a character sheet. Only the sheet's owner or their campaign's Game Master can do this. Without `sort_order` the entry is appended at the end.",
      inputSchema: z.object({
        character_id: uuid,
        kind: boundedText(40),
        name: boundedText(200),
        category: z.string().max(120).nullable().optional(),
        points: intField(-10000, 10000, "points").optional(),
        levels: intField(0, 1000, "levels").optional(),
        notes: z.string().max(4000).nullable().optional(),
        sort_order: intField(0, 1000000, "sort_order").optional(),
      }),
      outputSchema: itemOutput,
      annotations: create,
    },
    async (input) => {
      const access = await loadCharacter(ctx, input.character_id);
      requireCharacterWrite(access);
      let sortOrder = input.sort_order;
      if (sortOrder === undefined) {
        const { data: last, error: lastError } = await ctx.supabase
          .from("character_entries")
          .select("sort_order")
          .eq("character_id", input.character_id)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastError) fail("Reading the current entry order", lastError);
        const currentMax = typeof last?.sort_order === "number" ? last.sort_order : null;
        sortOrder = currentMax === null ? 0 : currentMax + 1;
      }
      const { data, error } = await ctx.supabase
        .from("character_entries")
        .insert({
          character_id: input.character_id,
          kind: input.kind,
          name: input.name,
          category: input.category ?? null,
          notes: input.notes ?? null,
          sort_order: sortOrder,
          ...(input.points === undefined ? {} : { points: input.points }),
          ...(input.levels === undefined ? {} : { levels: input.levels }),
        })
        .select("*")
        .single();
      if (error) fail("Adding the entry", error);
      return detailReply(
        `Added "${data.name}" to "${access.row.name}" (entry_id: ${data.id}).`,
        data,
      );
    },
  );

  tool(
    "update_character_entry",
    {
      title: "Update an entry on a character",
      description:
        "Changes one trait, skill, technique or piece of equipment on a character sheet. Only the sheet's owner or their campaign's Game Master can edit it. Fields left out stay unchanged.",
      inputSchema: z.object({
        entry_id: uuid,
        kind: boundedText(40).optional(),
        name: boundedText(200).optional(),
        category: z.string().max(120).nullable().optional(),
        points: intField(-10000, 10000, "points").optional(),
        levels: intField(0, 1000, "levels").optional(),
        notes: z.string().max(4000).nullable().optional(),
        sort_order: intField(0, 1000000, "sort_order").optional(),
      }),
      outputSchema: itemOutput,
      annotations: modify,
    },
    async ({ entry_id, ...patch }) => {
      const { data: found, error: lookupError } = await ctx.supabase
        .from("character_entries")
        .select("id, name, character_id")
        .eq("id", entry_id)
        .maybeSingle();
      if (lookupError) fail("Entry lookup", lookupError);
      if (!found) throw new Error("Entry not found, or you do not have access to it.");

      const access = await loadCharacter(ctx, found.character_id);
      requireCharacterWrite(access);

      const update = buildPatch(patch);
      requirePatch(update);
      const { data, error } = await ctx.supabase
        .from("character_entries")
        .update(update as Database["public"]["Tables"]["character_entries"]["Update"])
        .eq("id", entry_id)
        .select("*")
        .single();
      if (error) fail("Updating the entry", error);
      return detailReply(`Updated "${data.name}" on "${access.row.name}" (${data.id}).`, data);
    },
  );

  tool(
    "delete_character_entry",
    {
      title: "Remove an entry from a character",
      description:
        "Permanently removes one entry from a character sheet. Only the sheet's owner or their campaign's Game Master can do this.",
      inputSchema: z.object({ entry_id: uuid }),
      outputSchema: deleteOutput,
      annotations: destroy,
    },
    async ({ entry_id }) => {
      const { data: found, error: lookupError } = await ctx.supabase
        .from("character_entries")
        .select("id, name, character_id")
        .eq("id", entry_id)
        .maybeSingle();
      if (lookupError) fail("Entry lookup", lookupError);
      if (!found) throw new Error("Entry not found, or you do not have access to it.");

      const access = await loadCharacter(ctx, found.character_id);
      requireCharacterWrite(access);

      const { data, error } = await ctx.supabase
        .from("character_entries")
        .delete()
        .eq("id", entry_id)
        .select("id");
      if (error) fail("Deleting the entry", error);
      if (!data || data.length === 0) throw new Error("The entry was not deleted.");
      return deleteReply(`Removed "${found.name}" from "${access.row.name}".`, entry_id);
    },
  );

  registerDomainTools(tool, ctx);

  return server;
}

/** Names of every tool this server exposes, in registration order. */
export const MCP_TOOL_NAMES = [
  // campaigns
  "list_campaigns",
  "get_campaign",
  "create_campaign",
  "update_campaign",
  "delete_campaign",
  // entries
  "list_entry_types",
  "list_entries",
  "get_entry",
  "create_entry",
  "update_entry",
  "delete_entry",
  // relationships
  "list_relationships",
  "create_relationship",
  "update_relationship",
  "delete_relationship",
  // characters
  "list_characters",
  "get_character",
  "create_character",
  "update_character",
  "delete_character",
  // character entries
  "add_character_entry",
  "update_character_entry",
  "delete_character_entry",
  // domain tools (one discoverable tool per domain, routed by `action`)
  ...DOMAIN_TOOL_NAMES,
] as const;

/** Exported for tests: the fields that must never reach a non-GM caller. */
export const MCP_GM_ONLY_FIELDS = {
  entity: GM_ONLY_ENTITY_FIELDS,
  relationship: GM_ONLY_RELATIONSHIP_FIELDS,
} as const;

export { stripGmFields as __stripGmFields };
