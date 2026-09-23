/**
 * Version history: entity revisions and character versions.
 *
 * Snapshot shapes mirror `src/lib/lore.ts` (`snapshotEntity`,
 * `listEntityRevisions`) and `src/lib/api.ts` (`saveVersion`, `listVersions`).
 * Restores never run in TypeScript: they call the atomic, security-definer
 * RPCs `restore_entity_revision` / `restore_character_version`, which are the
 * only correct path and enforce their own authorization.
 */

import { z } from "zod/v4";
import type { Json } from "@/integrations/supabase/types";
import {
  CREATE,
  DESTROY,
  READ,
  actionRouter,
  detailReply,
  domainOutput,
  fail,
  limitField,
  listReply,
  loadCharacter,
  safeRpc,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, ToolRegistrar, Structured } from "@/lib/mcp/kit.server";

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("list_entry_revisions"), entry_id: uuid, limit: limitField })
    .describe("List an entry's saved revisions, newest first, without their full snapshots."),
  z
    .object({
      action: z.literal("snapshot_entry"),
      entry_id: uuid,
      label: z.string().max(200).optional(),
    })
    .describe("Save the entry's current content as a new revision."),
  z
    .object({ action: z.literal("restore_entry_revision"), revision_id: uuid })
    .describe("Restore an entry to a saved revision. This overwrites the entry's current content."),
  z
    .object({
      action: z.literal("list_character_versions"),
      character_id: uuid,
      limit: limitField,
    })
    .describe("List a character's saved versions, newest first, without their full snapshots."),
  z
    .object({
      action: z.literal("snapshot_character"),
      character_id: uuid,
      label: z.string().max(200).optional(),
    })
    .describe("Save the character's current sheet and entries as a new version."),
  z
    .object({ action: z.literal("restore_character_version"), version_id: uuid })
    .describe("Restore a character to a saved version. This replaces the sheet's current items."),
]);

type Input = z.infer<typeof input>;

/** Trims a revision/version row to what a list reply should show. */
function revisionSummary(row: {
  id: string;
  label: string | null;
  created_at: string;
  created_by: string;
}): Structured {
  return {
    id: row.id,
    label: row.label,
    created_at: row.created_at,
    created_by: row.created_by,
  };
}

export function registerHistory(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "history",
    {
      title: "Version history",
      description:
        "Manage saved revisions of world entries and saved versions of character sheets. " +
        "Actions: list_entry_revisions, list_character_versions (read summaries, no snapshot blob), " +
        "snapshot_entry, snapshot_character (save the current content as a new revision/version — changes data), " +
        "restore_entry_revision (overwrites the entry's current content with the saved revision — changes data), " +
        "restore_character_version (replaces the character sheet's current items with the saved version — changes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<Input>({
      list_entry_revisions: async (i) => {
        // Saved revisions carry the entry's full GM text, so they are GM-only.
        const { campaign } = await loadEntity(ctx, i.entry_id);
        requireGmFor(campaign, "read saved versions of an entry");
        const { data, error } = await ctx.supabase
          .from("entity_revisions")
          .select("id, label, created_at, created_by")
          .eq("entity_id", i.entry_id)
          .order("created_at", { ascending: false })
          .limit(i.limit ?? 30);
        if (error) fail("Listing entry revisions", error);
        const items = (data ?? []).map(revisionSummary);
        return listReply("entry revisions", items, items.length);
      },
      snapshot_entry: async (i) => {
        const { data: entry, error: entryError } = await ctx.supabase
          .from("entities")
          .select("*")
          .eq("id", i.entry_id)
          .maybeSingle();
        if (entryError) fail("Entry lookup", entryError);
        if (!entry) throw new Error("Entry not found, or you do not have access to it.");
        const { data, error } = await ctx.supabase
          .from("entity_revisions")
          .insert({
            campaign_id: entry.campaign_id,
            entity_id: entry.id,
            label: i.label ?? null,
            snapshot: entry as unknown as Record<string, unknown> as unknown as Json,
            created_by: ctx.userId,
          })
          .select("*")
          .single();
        if (error) fail("Saving entry revision", error);
        return detailReply(`Saved revision of "${entry.name}".`, data);
      },
      restore_entry_revision: async (i) => {
        const { data, error } = await safeRpc(ctx.supabase)("restore_entity_revision", {
          _revision: i.revision_id,
        }).single();
        if (error) fail("Restoring entry revision", error);
        return detailReply(`Restored "${data.name}" to the saved revision.`, data);
      },
      list_character_versions: async (i) => {
        await loadCharacter(ctx, i.character_id);
        const { data, error } = await ctx.supabase
          .from("character_versions")
          .select("id, label, created_at, created_by")
          .eq("character_id", i.character_id)
          .order("created_at", { ascending: false })
          .limit(i.limit ?? 40);
        if (error) fail("Listing character versions", error);
        const items = (data ?? []).map(revisionSummary);
        return listReply("character versions", items, items.length);
      },
      snapshot_character: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        const { data: entries, error: entriesError } = await ctx.supabase
          .from("character_entries")
          .select("*")
          .eq("character_id", i.character_id);
        if (entriesError) fail("Loading character entries", entriesError);
        const { data, error } = await ctx.supabase
          .from("character_versions")
          .insert({
            character_id: i.character_id,
            label: i.label ?? null,
            snapshot: { character: access.row, entries: entries ?? [] } as unknown as Json,
            created_by: ctx.userId,
          })
          .select("*")
          .single();
        if (error) fail("Saving character version", error);
        return detailReply(`Saved version of "${access.row.name}".`, data);
      },
      restore_character_version: async (i) => {
        const { data, error } = await safeRpc(ctx.supabase)("restore_character_version", {
          _version: i.version_id,
        }).single();
        if (error) fail("Restoring character version", error);
        return detailReply(`Restored "${data.name}" to the saved version.`, data);
      },
    }),
  );
}
