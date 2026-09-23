/**
 * Personal content library: reusable traits/skills/etc. entries, grouped into
 * named content packs.
 *
 * Reuses the app's own field lists and rules — see `src/lib/api.ts` (library
 * and content-pack CRUD), `src/lib/packs.ts` (pack grouping / default pack
 * name), and `src/lib/ai-import-guides.ts` (the `kind` allow-list, ENTRY_KINDS,
 * copied below since that module renders documentation text rather than
 * exporting the constant).
 *
 * Visibility values ("private" | "campaign" | "public") and the pack-sharing
 * rule come from the `library_select` / `packs_select` RLS policies
 * (see supabase/migrations/20260912184058_*.sql): a row is visible far more
 * widely than it is writable. Every write in this file re-checks
 * `owner_id = ctx.userId` explicitly, on top of RLS, so a caller who can see
 * someone else's shared content can never edit or delete it.
 */

import { z } from "zod/v4";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  actionRouter,
  boundedText,
  buildPatch,
  deleteReply,
  detailReply,
  domainOutput,
  fail,
  intField,
  jsonRecord,
  limitField,
  listReply,
  requirePatch,
  uuid,
  dbPayload,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, Structured, ToolRegistrar } from "@/lib/mcp/kit.server";
import type { Database } from "@/integrations/supabase/types";
import { allowedPacksOf, isPackAllowed } from "@/lib/packs";
import { loadCampaignSettings } from "@/lib/pack-link-service";
import { loadPackCandidatesDetailed, parseSearchName, withVersions } from "@/lib/pack-match";
import { candidateView } from "@/lib/mcp/pack-link.server";

// Source of truth: src/lib/ai-import-guides.ts (ENTRY_KINDS, not exported there)
const LIBRARY_KINDS = [
  "advantage",
  "disadvantage",
  "perk",
  "quirk",
  "skill",
  "technique",
  "spell",
  "equipment",
  "language",
  "culture",
  "custom",
] as const;

// Source of truth: library_select / packs_select RLS policies.
const LIBRARY_VISIBILITIES = ["private", "campaign", "public"] as const;

// Source of truth: src/lib/packs.ts DEFAULT_PACK_NAME
const DEFAULT_PACK_NAME = "My Content";

const numField = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label} must be a number between ${min} and ${max}` })
    .min(min)
    .max(max);

type LibraryEntryRow = Database["public"]["Tables"]["library_entries"]["Row"];
type ContentPackRow = Database["public"]["Tables"]["content_packs"]["Row"];

const LIBRARY_LIST_COLUMNS =
  "id,owner_id,campaign_id,kind,name,category,summary,base_points,cost_per_level,max_levels," +
  "tags,visibility,source_label,source_edition,source_page,source_type,pack,created_at,updated_at";

const entryWriteFields = {
  category: z.string().max(120).nullable().optional(),
  summary: z.string().max(4000).nullable().optional(),
  base_points: numField(-10000, 10000, "base_points").optional(),
  cost_per_level: numField(-10000, 10000, "cost_per_level").optional(),
  max_levels: intField(0, 1000, "max_levels").nullable().optional(),
  data: jsonRecord.optional(),
  tags: z.array(z.string().max(60)).max(50).optional(),
  pack: z.string().max(120).nullable().optional(),
  source_label: z.string().max(200).optional(),
  source_edition: z.string().max(120).nullable().optional(),
  source_page: z.string().max(60).nullable().optional(),
  source_type: z.string().max(60).optional(),
  visibility: z.enum(LIBRARY_VISIBILITIES).optional(),
  campaign_id: uuid.nullable().optional(),
} as const;

const packWriteFields = {
  description: z.string().max(2000).nullable().optional(),
  source_label: z.string().max(200).optional(),
  source_edition: z.string().max(120).nullable().optional(),
  source_type: z.string().max(60).optional(),
  visibility: z.enum(LIBRARY_VISIBILITIES).optional(),
} as const;

const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      search: z.string().max(200).optional(),
      kind: z.enum(LIBRARY_KINDS).optional(),
      pack: z.string().max(120).optional(),
      visibility: z.enum(LIBRARY_VISIBILITIES).optional(),
      campaign_id: uuid.optional(),
      limit: limitField,
    })
    .describe(
      "List library entries visible to the caller (own entries, public entries, entries in a " +
        "campaign the caller is a member of, or entries in a pack shared with the caller), " +
        "optionally filtered by search text, kind, pack name, visibility, or campaign.",
    ),
  z
    .object({ action: z.literal("get"), entry_id: uuid })
    .describe("Read one library entry, including its full detail data."),
  z
    .object({
      action: z.literal("create"),
      kind: z.enum(LIBRARY_KINDS),
      name: boundedText(200),
      ...entryWriteFields,
    })
    .describe(
      "Create a library entry owned by the caller. If pack is omitted or blank it defaults to " +
        `"${DEFAULT_PACK_NAME}"; the named pack is created for the caller if it does not exist ` +
        "yet. Changes data.",
    ),
  z
    .object({
      action: z.literal("update"),
      entry_id: uuid,
      name: boundedText(200).optional(),
      ...entryWriteFields,
    })
    .describe(
      "Update a library entry's fields. Omitted fields are unchanged. Only the entry's owner may " +
        "update it, even if the caller can see it. Changes data.",
    ),
  z
    .object({ action: z.literal("delete"), entry_id: uuid })
    .describe(
      "Delete a library entry. Only the entry's owner may delete it, even if the caller can see " +
        "it. Deletes data.",
    ),
  z
    .object({
      action: z.literal("list_packs"),
      limit: limitField,
      campaign_id: uuid.optional(),
    })
    .describe(
      "List content packs visible to the caller (own packs, public packs, or packs shared with " +
        "the caller), with how many entries each one holds and whether the caller owns it. With " +
        "campaign_id, each pack also says whether that campaign allows it.",
    ),
  z
    .object({
      action: z.literal("search_pack_entries"),
      query: boundedText(200).optional(),
      name: boundedText(200)
        .optional()
        .describe(
          "Deprecated alias for query. Use query instead; support for name will be removed.",
        ),
      kind: z.enum(LIBRARY_KINDS).optional(),
      pack_id: uuid.optional(),
      campaign_id: uuid.optional(),
      limit: limitField,
    })
    .describe(
      "Search pack items the caller may actually use, the same way character entries are matched " +
        "by name (query, or the deprecated name alias — one of the two is required). With " +
        "campaign_id the search is limited to the packs that campaign allows. Each result carries " +
        "the fields needed to link it to a character entry (defaults, prerequisites, difficulty, " +
        "attribute, specialization, etc.), including its id and current definition fingerprint.",
    ),
  z
    .object({ action: z.literal("get_pack"), pack_id: uuid })
    .describe("Read one content pack's metadata."),
  z
    .object({ action: z.literal("create_pack"), name: boundedText(120), ...packWriteFields })
    .describe("Create a content pack owned by the caller. Changes data."),
  z
    .object({ action: z.literal("update_pack"), pack_id: uuid, ...packWriteFields })
    .describe(
      "Update a pack's description/source/visibility. Omitted fields are unchanged. Use " +
        "rename_pack to change the name. Only the pack's owner may update it. Changes data.",
    ),
  z
    .object({ action: z.literal("rename_pack"), pack_id: uuid, name: boundedText(120) })
    .describe(
      "Rename a pack and re-tag every one of the caller's own library entries that referenced " +
        "the old name. Only the pack's owner may rename it. Changes data.",
    ),
  z
    .object({ action: z.literal("delete_pack"), pack_id: uuid })
    .describe(
      "Delete a pack and every library entry inside it. Copies already placed on a character " +
        "sheet keep their origin information; they simply show as out of date or no longer " +
        "available once it can be shown that the source pack is gone. Only the pack's owner may " +
        "delete it. Deletes data.",
    ),
  z
    .object({
      action: z.literal("set_entry_pack"),
      entry_id: uuid,
      pack: z.string().max(120).nullable(),
    })
    .describe(
      "Move a library entry into a pack, or out of any pack when pack is null. Only the entry's " +
        "owner may do this. Changes data.",
    ),
  z
    .object({
      action: z.literal("import_entries"),
      entries: z
        .array(
          z.object({ kind: z.enum(LIBRARY_KINDS), name: boundedText(200), ...entryWriteFields }),
        )
        .min(1)
        .max(200),
    })
    .describe(
      "Bulk-create library entries owned by the caller in one call, creating any named packs " +
        "that do not exist yet (same defaulting rule as create). Changes data.",
    ),
]);

function toStructured(row: LibraryEntryRow | ContentPackRow): Structured {
  return { ...row };
}

async function loadEntry(ctx: McpToolContext, entryId: string): Promise<LibraryEntryRow> {
  const { data, error } = await ctx.supabase
    .from("library_entries")
    .select("*")
    .eq("id", entryId)
    .maybeSingle();
  if (error) fail("Library entry lookup", error);
  if (!data) throw new Error("Library entry not found, or you do not have access to it.");
  return data;
}

async function loadPack(ctx: McpToolContext, packId: string): Promise<ContentPackRow> {
  const { data, error } = await ctx.supabase
    .from("content_packs")
    .select("*")
    .eq("id", packId)
    .maybeSingle();
  if (error) fail("Content pack lookup", error);
  if (!data) throw new Error("Content pack not found, or you do not have access to it.");
  return data;
}

function requireEntryOwner(row: LibraryEntryRow, action: string, ctx: McpToolContext): void {
  if (row.owner_id !== ctx.userId) {
    throw new Error(`Only the owner of "${row.name}" can ${action} this library entry.`);
  }
}

function requirePackOwner(row: ContentPackRow, action: string, ctx: McpToolContext): void {
  if (row.owner_id !== ctx.userId) {
    throw new Error(`Only the owner of the "${row.name}" pack can ${action} it.`);
  }
}

/** Mirrors src/lib/api.ts `ensureContentPack`: creates the pack row for this owner if missing. */
async function ensureContentPack(ctx: McpToolContext, name: string): Promise<void> {
  const { data: existing, error } = await ctx.supabase
    .from("content_packs")
    .select("id")
    .eq("owner_id", ctx.userId)
    .eq("name", name)
    .maybeSingle();
  if (error) fail("Content pack lookup", error);
  if (existing) return;
  const { error: insertError } = await ctx.supabase
    .from("content_packs")
    .insert({ name, owner_id: ctx.userId });
  if (insertError) fail("Creating content pack", insertError);
}

/**
 * Mirrors src/lib/api.ts `deletePackContents`: deletes the pack's library
 * entries and drops the pack from the caller's sheets.
 *
 * Copies already on a character sheet are left exactly as they are — their
 * provenance and any pack link are kept, so the sheet can still show where the
 * entry came from and report it as out of date.
 */
async function deletePackContents(ctx: McpToolContext, name: string): Promise<void> {
  const { data: mine, error: charsError } = await ctx.supabase
    .from("characters")
    .select("id, packs")
    .eq("owner_id", ctx.userId);
  if (charsError) fail("Listing characters", charsError);
  const ids = (mine ?? []).map((row) => row.id);

  if (ids.length) {
    const groups = new Map<string, { packs: string[]; ids: string[] }>();
    for (const character of mine ?? []) {
      const packs = (character.packs ?? []) as string[];
      if (!packs.some((p) => p.toLowerCase() === name.toLowerCase())) continue;
      const next = packs.filter((p) => p.toLowerCase() !== name.toLowerCase());
      const key = JSON.stringify(next);
      const group = groups.get(key) ?? { packs: next, ids: [] };
      group.ids.push(character.id);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      for (let i = 0; i < group.ids.length; i += 200) {
        const { error } = await ctx.supabase
          .from("characters")
          .update({ packs: group.packs })
          .in("id", group.ids.slice(i, i + 200));
        if (error) fail("Updating character pack lists", error);
      }
    }
  }

  const { error } = await ctx.supabase
    .from("library_entries")
    .delete()
    .eq("owner_id", ctx.userId)
    .eq("pack", name);
  if (error) fail("Deleting pack contents", error);
}

export function registerLibrary(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "library",
    {
      title: "Content library & packs",
      description:
        "Manage the caller's personal content library and content packs. Library actions: list " +
        "(read entries visible to the caller), get (read one entry with full detail), create " +
        "(add an entry owned by the caller, changes data), update (edit an entry, owner only, " +
        "changes data), delete (remove an entry, owner only, deletes data). Pack actions: " +
        "list_packs (read packs visible to the caller), get_pack (read one pack), create_pack " +
        "(owned by the caller, changes data), update_pack (edit a pack's metadata, owner only, " +
        "changes data), rename_pack (rename a pack and re-tag its entries, owner only, changes " +
        "data), delete_pack (delete a pack and every entry inside it, owner only, deletes data), " +
        "set_entry_pack (move an entry into or out of a pack, owner only, changes data), " +
        "import_entries (bulk-create entries owned by the caller, changes data), " +
        "search_pack_entries (find pack items the caller may use, for linking to character " +
        "entries).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      list: async (i) => {
        const limit = i.limit ?? 50;
        let query = ctx.supabase.from("library_entries").select(LIBRARY_LIST_COLUMNS).order("name");
        let countQuery = ctx.supabase
          .from("library_entries")
          .select("id", { count: "exact", head: true });
        if (i.search) {
          query = query.ilike("name", `%${i.search}%`);
          countQuery = countQuery.ilike("name", `%${i.search}%`);
        }
        if (i.kind) {
          query = query.eq("kind", i.kind);
          countQuery = countQuery.eq("kind", i.kind);
        }
        if (i.pack) {
          query = query.eq("pack", i.pack);
          countQuery = countQuery.eq("pack", i.pack);
        }
        if (i.visibility) {
          query = query.eq("visibility", i.visibility);
          countQuery = countQuery.eq("visibility", i.visibility);
        }
        if (i.campaign_id) {
          query = query.eq("campaign_id", i.campaign_id);
          countQuery = countQuery.eq("campaign_id", i.campaign_id);
        }
        const { data, error } = await query.limit(limit);
        if (error) fail("Listing library entries", error);
        const { count, error: countError } = await countQuery;
        if (countError) fail("Counting library entries", countError);
        const items = (data ?? []) as unknown as Structured[];
        return listReply("library entries", items, count ?? items.length);
      },

      get: async (i) => {
        const row = await loadEntry(ctx, i.entry_id);
        return detailReply(`Library entry "${row.name}".`, toStructured(row));
      },

      create: async (i) => {
        const pack = (i.pack ?? "").trim() || DEFAULT_PACK_NAME;
        await ensureContentPack(ctx, pack);
        const { data, error } = await ctx.supabase
          .from("library_entries")
          .insert(
            dbPayload<TablesInsert<"library_entries">>({
              kind: i.kind,
              name: i.name,
              category: i.category ?? null,
              summary: i.summary ?? null,
              base_points: i.base_points,
              cost_per_level: i.cost_per_level,
              max_levels: i.max_levels ?? null,
              data: i.data as Database["public"]["Tables"]["library_entries"]["Insert"]["data"],
              tags: i.tags ?? [],
              pack,
              source_label: i.source_label,
              source_edition: i.source_edition ?? null,
              source_page: i.source_page ?? null,
              source_type: i.source_type,
              visibility: i.visibility,
              campaign_id: i.campaign_id ?? null,
              owner_id: ctx.userId,
            }),
          )
          .select("*")
          .single();
        if (error) fail("Creating library entry", error);
        return detailReply(
          `Created library entry "${(data as LibraryEntryRow).name}".`,
          toStructured(data as LibraryEntryRow),
        );
      },

      update: async (i) => {
        const row = await loadEntry(ctx, i.entry_id);
        requireEntryOwner(row, "update", ctx);
        const patch = buildPatch({
          name: i.name,
          category: i.category,
          summary: i.summary,
          base_points: i.base_points,
          cost_per_level: i.cost_per_level,
          max_levels: i.max_levels,
          data: i.data,
          tags: i.tags,
          pack: i.pack,
          source_label: i.source_label,
          source_edition: i.source_edition,
          source_page: i.source_page,
          source_type: i.source_type,
          visibility: i.visibility,
          campaign_id: i.campaign_id,
        });
        requirePatch(patch);
        const { data, error } = await ctx.supabase
          .from("library_entries")
          .update(patch as Database["public"]["Tables"]["library_entries"]["Update"])
          .eq("id", i.entry_id)
          .select("*")
          .single();
        if (error) fail("Updating library entry", error);
        return detailReply(
          `Updated library entry "${(data as LibraryEntryRow).name}".`,
          toStructured(data as LibraryEntryRow),
        );
      },

      delete: async (i) => {
        const row = await loadEntry(ctx, i.entry_id);
        requireEntryOwner(row, "delete", ctx);
        const { error } = await ctx.supabase.from("library_entries").delete().eq("id", i.entry_id);
        if (error) fail("Deleting library entry", error);
        return deleteReply(`Deleted library entry "${row.name}".`, i.entry_id);
      },

      list_packs: async (i) => {
        const limit = i.limit ?? 50;
        const { data, error } = await ctx.supabase
          .from("content_packs")
          .select("*")
          .order("name")
          .limit(limit);
        if (error) fail("Listing content packs", error);
        const { count, error: countError } = await ctx.supabase
          .from("content_packs")
          .select("id", { count: "exact", head: true });
        if (countError) fail("Counting content packs", countError);

        const rows = (data ?? []) as ContentPackRow[];
        // Keyed by owner_id + normalized pack name so two owners with a
        // same-named pack never contaminate each other's counts. RLS still
        // decides which library_entries rows are visible in the first place.
        const { data: entryRows, error: entriesError } = await ctx.supabase
          .from("library_entries")
          .select("owner_id,pack")
          .limit(10000);
        if (entriesError) fail("Counting pack entries", entriesError);
        const counts = new Map<string, number>();
        for (const row of entryRows ?? []) {
          const packName = (row.pack ?? "").trim().toLowerCase();
          if (!packName) continue;
          const key = `${row.owner_id}::${packName}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        let allowed: string[] | null = null;
        if (i.campaign_id) {
          const settings = await loadCampaignSettings(ctx.supabase, i.campaign_id);
          allowed = allowedPacksOf(settings);
        }

        const items = rows.map((row) => ({
          ...toStructured(row),
          entry_count: counts.get(`${row.owner_id}::${row.name.trim().toLowerCase()}`) ?? 0,
          owned_by_caller: row.owner_id === ctx.userId,
          ...(allowed === null ? {} : { allowed_in_campaign: isPackAllowed(row.name, allowed) }),
        }));
        return listReply("content packs", items, count ?? items.length);
      },

      search_pack_entries: async (i) => {
        // `name` is a deprecated compatibility alias for `query`; at least one is required.
        const searchText = i.query ?? i.name;
        if (!searchText) {
          throw new Error(
            "search_pack_entries needs a query (the deprecated name field may be used instead).",
          );
        }
        const settings = i.campaign_id
          ? await loadCampaignSettings(ctx.supabase, i.campaign_id)
          : undefined;
        const parsed = parseSearchName(searchText);
        const limit = i.limit ?? 25;
        const scope: Parameters<typeof loadPackCandidatesDetailed>[1] = {
          search: parsed.base,
          limit,
        };
        if (i.kind) scope.kind = i.kind;
        if (i.pack_id) scope.packId = i.pack_id;
        if (settings !== undefined) scope.campaignSettings = settings;
        const scan = await loadPackCandidatesDetailed(ctx.supabase, scope);
        const withVersion = await withVersions(scan.candidates);
        const items = withVersion.map((candidate) => candidateView(candidate));
        // The total is the real number of matches, so a caller can tell an
        // empty result from a capped one and ambiguity is never hidden.
        return listReply("pack items", items, scan.matched);

      },

      get_pack: async (i) => {
        const row = await loadPack(ctx, i.pack_id);
        return detailReply(`Content pack "${row.name}".`, toStructured(row));
      },

      create_pack: async (i) => {
        const { data, error } = await ctx.supabase
          .from("content_packs")
          .insert(
            dbPayload<TablesInsert<"content_packs">>({
              name: i.name,
              description: i.description ?? null,
              source_label: i.source_label,
              source_edition: i.source_edition ?? null,
              source_type: i.source_type,
              visibility: i.visibility,
              owner_id: ctx.userId,
            }),
          )
          .select("*")
          .single();
        if (error) fail("Creating content pack", error);
        return detailReply(
          `Created content pack "${(data as ContentPackRow).name}".`,
          toStructured(data as ContentPackRow),
        );
      },

      update_pack: async (i) => {
        const row = await loadPack(ctx, i.pack_id);
        requirePackOwner(row, "update", ctx);
        const patch = buildPatch({
          description: i.description,
          source_label: i.source_label,
          source_edition: i.source_edition,
          source_type: i.source_type,
          visibility: i.visibility,
        });
        requirePatch(patch);
        const { data, error } = await ctx.supabase
          .from("content_packs")
          .update(patch as Database["public"]["Tables"]["content_packs"]["Update"])
          .eq("id", i.pack_id)
          .select("*")
          .single();
        if (error) fail("Updating content pack", error);
        return detailReply(
          `Updated content pack "${(data as ContentPackRow).name}".`,
          toStructured(data as ContentPackRow),
        );
      },

      rename_pack: async (i) => {
        const row = await loadPack(ctx, i.pack_id);
        requirePackOwner(row, "rename", ctx);
        const oldName = row.name;
        const { data, error } = await ctx.supabase
          .from("content_packs")
          .update({ name: i.name })
          .eq("id", i.pack_id)
          .select("*")
          .single();
        if (error) fail("Renaming content pack", error);
        const { error: retagError } = await ctx.supabase
          .from("library_entries")
          .update({ pack: i.name })
          .eq("owner_id", ctx.userId)
          .eq("pack", oldName);
        if (retagError) fail("Re-tagging library entries", retagError);
        return detailReply(
          `Renamed content pack "${oldName}" to "${i.name}" and re-tagged its entries.`,
          toStructured(data as ContentPackRow),
        );
      },

      delete_pack: async (i) => {
        const row = await loadPack(ctx, i.pack_id);
        requirePackOwner(row, "delete", ctx);
        await deletePackContents(ctx, row.name);
        const { error } = await ctx.supabase.from("content_packs").delete().eq("id", i.pack_id);
        if (error) fail("Deleting content pack", error);
        return deleteReply(`Deleted content pack "${row.name}" and its entries.`, i.pack_id);
      },

      set_entry_pack: async (i) => {
        const row = await loadEntry(ctx, i.entry_id);
        requireEntryOwner(row, "move", ctx);
        const { data, error } = await ctx.supabase
          .from("library_entries")
          .update({ pack: i.pack })
          .eq("id", i.entry_id)
          .select("*")
          .single();
        if (error) fail("Moving library entry", error);
        return detailReply(
          i.pack
            ? `Moved "${row.name}" into pack "${i.pack}".`
            : `Removed "${row.name}" from its pack.`,
          toStructured(data as LibraryEntryRow),
        );
      },

      import_entries: async (i) => {
        const withPacks = i.entries.map((entry) => ({
          ...entry,
          pack: (entry.pack ?? "").trim() || DEFAULT_PACK_NAME,
        }));
        for (const name of new Set(withPacks.map((entry) => entry.pack))) {
          await ensureContentPack(ctx, name);
        }
        const { data, error } = await ctx.supabase
          .from("library_entries")
          .insert(
            withPacks.map((entry) =>
              dbPayload<TablesInsert<"library_entries">>({
                kind: entry.kind,
                name: entry.name,
                category: entry.category ?? null,
                summary: entry.summary ?? null,
                base_points: entry.base_points,
                cost_per_level: entry.cost_per_level,
                max_levels: entry.max_levels ?? null,
                data: entry.data as Database["public"]["Tables"]["library_entries"]["Insert"]["data"],
                tags: entry.tags ?? [],
                pack: entry.pack,
                source_label: entry.source_label,
                source_edition: entry.source_edition ?? null,
                source_page: entry.source_page ?? null,
                source_type: entry.source_type,
                visibility: entry.visibility,
                campaign_id: entry.campaign_id ?? null,
                owner_id: ctx.userId,
              }),
            ),
          )
          .select("*");
        if (error) fail("Importing library entries", error);
        const items = (data ?? []) as unknown as Structured[];
        return listReply("library entries", items, items.length);
      },
    }),
  );
}
