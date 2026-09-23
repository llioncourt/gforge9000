/**
 * Character sheet line-item tools: add_character_entry,
 * update_character_entry, delete_character_entry. These are the only tools
 * that touch the optional content-pack link on a character entry.
 */
import { z } from "zod/v4";
import type { Database } from "@/integrations/supabase/types";
import { investedPoints, isSkillLikeKind } from "@/rules/skill-points";
import {
  assertLinkFlags,
  candidateView,
  definitionFill,
  resolveTarget,
  settingsForCharacter,
  sourceWithLink,
  sourceWithoutLink,
  statusFor,
  withPackState,
} from "@/lib/mcp/pack-link.server";
import type { EntryRowLike } from "@/lib/pack-link-service";
import {
  CREATE,
  DESTROY,
  MODIFY,
  boundedText,
  buildPatch,
  deleteOutput,
  deleteReply,
  detailReply,
  fail,
  intField,
  itemOutput,
  loadCharacter,
  requireCharacterWrite,
  requirePatch,
  uuid,
  type McpToolContext,
  type ToolRegistrar,
} from "@/lib/mcp/kit.server";

const addCharacterEntryInput = z.object({
  character_id: uuid,
  kind: boundedText(40),
  name: boundedText(200),
  category: z.string().max(120).nullable().optional(),
  points: intField(-10000, 10000, "points").optional(),
  levels: intField(0, 1000, "levels").optional(),
  notes: z.string().max(4000).nullable().optional(),
  sort_order: intField(0, 1000000, "sort_order").optional(),
  pack_entry_id: uuid.optional(),
  match_pack: z.boolean().optional(),
});
const updateCharacterEntryInput = z.object({
  entry_id: uuid,
  kind: boundedText(40).optional(),
  name: boundedText(200).optional(),
  category: z.string().max(120).nullable().optional(),
  points: intField(-10000, 10000, "points").optional(),
  levels: intField(0, 1000, "levels").optional(),
  notes: z.string().max(4000).nullable().optional(),
  sort_order: intField(0, 1000000, "sort_order").optional(),
  pack_entry_id: uuid.optional(),
  match_pack: z.boolean().optional(),
  unlink: z.boolean().optional(),
});
const deleteCharacterEntryInput = z.object({ entry_id: uuid });

export function registerCharacterEntries(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "add_character_entry",
    {
      title: "Add an entry to a character",
      description:
        "Adds one trait, skill, technique or piece of equipment to a character sheet. Only the sheet's owner or their campaign's Game Master can do this. Without `sort_order` the entry is appended at the end. Optionally the new entry can be linked to a content-pack item: pass `pack_entry_id` to link a specific item, or `match_pack: true` to look one up by name among the packs the caller may use (and, for a sheet in a campaign, that the campaign allows). `pack_entry_id` and `match_pack` are mutually exclusive. A link fills in mechanical fields you left out but never overwrites values you supplied; an ambiguous name match writes nothing and returns the candidates instead; no match simply creates a normal custom entry.",
      inputSchema: addCharacterEntryInput,
      outputSchema: itemOutput,
      annotations: CREATE,
    },
    async (input) => {
      const access = await loadCharacter(ctx, input.character_id);
      requireCharacterWrite(access);
      assertLinkFlags({ pack_entry_id: input.pack_entry_id, match_pack: input.match_pack });
      const settings = await settingsForCharacter(ctx, access.row.campaign_id);

      const target = await resolveTarget(
        ctx,
        { pack_entry_id: input.pack_entry_id, match_pack: input.match_pack },
        { kind: input.kind, name: input.name, category: input.category },
        settings,
      );
      if (target.ambiguous) {
        const candidates = target.ambiguous.map(candidateView);
        return detailReply(
          `"${input.name}" matches ${candidates.length} pack items — nothing was added. Call again with pack_entry_id set to the one you mean.`,
          { created: false, match_status: "ambiguous", candidates },
        );
      }

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

      let linkFields: Record<string, unknown> = {};
      if (target.item && target.method) {
        const filled = definitionFill(
          target.item,
          { category: input.category, points: input.points, levels: input.levels },
          input.kind,
          target.specialization,
        );
        const { source } = await sourceWithLink({}, target.item, target.method);
        linkFields = { ...filled, source };
      }

      const payload: Record<string, unknown> = {
        character_id: input.character_id,
        kind: input.kind,
        name: input.name,
        category: input.category ?? null,
        notes: input.notes ?? null,
        sort_order: sortOrder,
        ...(input.points === undefined ? {} : { points: input.points }),
        ...(input.levels === undefined ? {} : { levels: input.levels }),
        ...linkFields,
      };
      // Skill-like entries carry invested points in BOTH `points` and
      // `data.points`; a new row must never be created with the two diverging.
      if (isSkillLikeKind(input.kind)) {
        const data = (payload["data"] as Record<string, unknown> | undefined) ?? {};
        const value =
          input.points ?? investedPoints({ kind: input.kind, points: payload["points"] as number, data });
        payload["points"] = value;
        payload["data"] = { ...data, points: value };
      }
      const { data, error } = await ctx.supabase
        .from("character_entries")
        .insert(payload as Database["public"]["Tables"]["character_entries"]["Insert"])
        .select("*")
        .single();
      if (error) fail("Adding the entry", error);

      const status = await statusFor(ctx, data as unknown as EntryRowLike, settings);
      const matchNote =
        input.match_pack === true && !target.item ? " No matching pack item was found." : "";
      return detailReply(
        `Added "${data.name}" to "${access.row.name}" (entry_id: ${data.id}).${matchNote}`,
        withPackState(data, status),
      );
    },
  );

  tool(
    "update_character_entry",
    {
      title: "Update an entry on a character",
      description:
        "Changes one trait, skill, technique or piece of equipment on a character sheet. Only the sheet's owner or their campaign's Game Master can edit it. Fields left out stay unchanged. Pack linking is optional and separate from the sheet values: `pack_entry_id` links this entry to a specific pack item, `match_pack: true` tries to find one by name, and `unlink: true` removes the link while keeping every value and all other provenance. The three are mutually exclusive. Linking never rewrites existing sheet values, and a name match that finds nothing leaves an existing link in place.",
      inputSchema: updateCharacterEntryInput,
      outputSchema: itemOutput,
      annotations: MODIFY,
    },
    async ({ entry_id, pack_entry_id, match_pack, unlink, ...patch }) => {
      assertLinkFlags({ pack_entry_id, match_pack, unlink });
      const { data: found, error: lookupError } = await ctx.supabase
        .from("character_entries")
        .select("id, name, kind, category, character_id, source, points, data")
        .eq("id", entry_id)
        .maybeSingle();
      if (lookupError) fail("Entry lookup", lookupError);
      if (!found) throw new Error("Entry not found, or you do not have access to it.");

      const access = await loadCharacter(ctx, found.character_id);
      requireCharacterWrite(access);
      const settings = await settingsForCharacter(ctx, access.row.campaign_id);

      const update = buildPatch(patch) as Record<string, unknown>;
      const touchesLink = Boolean(pack_entry_id) || match_pack === true || unlink === true;
      if (Object.keys(update).length === 0 && !touchesLink) requirePatch(update);

      let ambiguousNote = "";
      if (unlink === true) {
        update["source"] = sourceWithoutLink(found.source);
      } else if (pack_entry_id || match_pack === true) {
        const target = await resolveTarget(
          ctx,
          { pack_entry_id, match_pack },
          {
            kind: (update["kind"] as string | undefined) ?? found.kind,
            name: (update["name"] as string | undefined) ?? found.name,
            category: (update["category"] as string | null | undefined) ?? found.category,
          },
          settings,
        );
        if (target.ambiguous) {
          const candidates = target.ambiguous.map(candidateView);
          return detailReply(
            `"${found.name}" matches ${candidates.length} pack items — nothing was changed. Call again with pack_entry_id set to the one you mean.`,
            { updated: false, match_status: "ambiguous", candidates },
          );
        }
        if (target.item && target.method) {
          const { source } = await sourceWithLink(found.source, target.item, target.method);
          update["source"] = source;
        } else {
          // No match: an existing link is never silently removed.
          ambiguousNote = " No matching pack item was found; any existing link was kept.";
        }
      }

      // Skill-like entries: an explicit `points` write is authoritative and is
      // mirrored into `data.points`, preserving every other data key. Any
      // other touch on such an entry normalises the two representations to the
      // current EFFECTIVE value (legacy untouched rows are left alone).
      const effectiveKind = (update["kind"] as string | undefined) ?? found.kind;
      if (isSkillLikeKind(effectiveKind) && Object.keys(update).length > 0) {
        const currentData = (found.data as Record<string, unknown> | null) ?? {};
        const value =
          patch.points ??
          investedPoints({
            kind: effectiveKind,
            points: found.points,
            data: currentData,
            source: found.source,
          });
        update["points"] = value;
        update["data"] = { ...currentData, ...((update["data"] as object) ?? {}), points: value };
      }

      if (Object.keys(update).length === 0) {
        const current = (await ctx.supabase
          .from("character_entries")
          .select("*")
          .eq("id", entry_id)
          .single()) as { data: Database["public"]["Tables"]["character_entries"]["Row"] };
        const status = await statusFor(ctx, current.data as unknown as EntryRowLike, settings);
        return detailReply(
          `No changes were needed for "${found.name}".${ambiguousNote}`,
          withPackState(current.data, status),
        );
      }

      const { data, error } = await ctx.supabase
        .from("character_entries")
        .update(update as Database["public"]["Tables"]["character_entries"]["Update"])
        .eq("id", entry_id)
        .select("*")
        .single();
      if (error) fail("Updating the entry", error);
      const status = await statusFor(ctx, data as unknown as EntryRowLike, settings);
      return detailReply(
        `Updated "${data.name}" on "${access.row.name}" (${data.id}).${ambiguousNote}`,
        withPackState(data, status),
      );
    },
  );

  tool(
    "delete_character_entry",
    {
      title: "Remove an entry from a character",
      description:
        "Permanently removes one entry from a character sheet. Only the sheet's owner or their campaign's Game Master can do this.",
      inputSchema: deleteCharacterEntryInput,
      outputSchema: deleteOutput,
      annotations: DESTROY,
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
}
