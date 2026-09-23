/**
 * P0-04 regression: `library.list_packs` used to count entries with a single
 * unpaged `library_entries` query capped at PostgREST's row limit (1000), so
 * a pack with more visible entries than that reported a truncated count. The
 * fix pages through every visible row instead of inferring completeness from
 * one response.
 */
import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import { registerLibrary } from "@/lib/mcp/domains/library.server";
import { registrar } from "@/lib/mcp/kit.server";
import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";

/** Mirrors Supabase's default `db.max-rows`. */
const SERVER_MAX_ROWS = 1000;

function fakeSupabase(tables: {
  content_packs: { id: string; owner_id: string; name: string }[];
  library_entries: { id: string; owner_id: string; pack: string | null }[];
}) {
  const builder = (rows: Record<string, unknown>[]) => {
    let working = [...rows];
    let from = 0;
    let to = Number.MAX_SAFE_INTEGER;
    let countMode = false;

    const self: Record<string, unknown> = {};
    self["select"] = (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) countMode = true;
      return self;
    };
    self["eq"] = (column: string, value: unknown) => {
      working = working.filter((row) => row[column] === value);
      return self;
    };
    self["order"] = () => self;
    self["limit"] = (count: number) => {
      to = count - 1;
      return self;
    };
    self["range"] = (start: number, end: number) => {
      from = start;
      to = end;
      return self;
    };
    self["then"] = (resolve: (value: { data: unknown; count: number | null; error: null }) => unknown) => {
      const page = working.slice(from, to + 1).slice(0, SERVER_MAX_ROWS);
      return resolve({
        data: countMode ? null : page,
        count: countMode ? working.length : null,
        error: null,
      });
    };
    return self;
  };

  return {
    from: (table: string) =>
      builder(
        (table === "library_entries"
          ? tables.library_entries
          : tables.content_packs) as unknown as Record<string, unknown>[],
      ),
  } as unknown as McpToolContext["supabase"];
}

function buildLibraryTool(ctx: McpToolContext) {
  const server = new McpServer({ name: "test", version: "1", title: "test" });
  const tool = registrar(server);
  let handler: unknown;
  const spy: ToolRegistrar = (name, definition, h) => {
    tool(name, definition, h);
    if (name === "library") handler = h;
  };
  registerLibrary(spy, ctx);
  return handler as (input: unknown) => Promise<{
    structuredContent: { items: { name: string; entry_count: number }[] };
  }>;
}

describe("library.list_packs reports exact entry counts past the server page cap (P0-04)", () => {
  it("counts a 1730-entry pack exactly instead of capping at 1000", async () => {
    const packs = [{ id: "pack-1", owner_id: "user-1", name: "GURPS Basico" }];
    const entries = Array.from({ length: 1730 }, (_, i) => ({
      id: `e-${i}`,
      owner_id: "user-1",
      pack: "GURPS Basico",
    }));
    const ctx: McpToolContext = { supabase: fakeSupabase({ content_packs: packs, library_entries: entries }), userId: "user-1" };
    const library = buildLibraryTool(ctx);
    const result = await library({ action: "list_packs", limit: 50 });
    const item = result.structuredContent.items.find((p) => p.name === "GURPS Basico");
    expect(item?.entry_count).toBe(1730);
  });

  it("still scopes counts by owner_id + normalized pack name", async () => {
    const packs = [
      { id: "pack-1", owner_id: "user-1", name: "Core" },
      { id: "pack-2", owner_id: "user-2", name: "Core" },
    ];
    const entries = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `a-${i}`, owner_id: "user-1", pack: "core" })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `b-${i}`, owner_id: "user-2", pack: "Core" })),
    ];
    const ctx: McpToolContext = { supabase: fakeSupabase({ content_packs: packs, library_entries: entries }), userId: "user-1" };
    const library = buildLibraryTool(ctx);
    const result = await library({ action: "list_packs", limit: 50 });
    const mine = result.structuredContent.items.find((p) => p.name === "Core" && (p as unknown as { owned_by_caller: boolean }).owned_by_caller);
    const theirs = result.structuredContent.items.find((p) => p.name === "Core" && !(p as unknown as { owned_by_caller: boolean }).owned_by_caller);
    expect(mine?.entry_count).toBe(5);
    expect(theirs?.entry_count).toBe(3);
  });
});
