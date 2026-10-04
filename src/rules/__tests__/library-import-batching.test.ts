/**
 * P0-05 regression: `importLibraryEntries` used to insert every row in one
 * request and `.select()` the result, which PostgREST caps at its server row
 * limit (1000) — so importing >1000 rows silently reported only 1000
 * imported. The fix batches inserts and asserts each batch's returned length
 * matches its input length.
 */
import { describe, expect, it, vi } from "vitest";

const SERVER_MAX_ROWS = 1000;
const state = { rows: [] as Record<string, unknown>[] };

vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => {
    let pendingInsert: Record<string, unknown>[] | null = null;
    const self: Record<string, unknown> = {};
    self["select"] = () => {
      if (name !== "library_entries" || pendingInsert === null) {
        // Still chainable: lookups do `.select(...).eq(...).maybeSingle()`.
        return self;
      }
      const inserted = pendingInsert.map((row, i) => ({
        id: `row-${state.rows.length + i}`,
        ...row,
      }));
      state.rows.push(...inserted);
      // Mirror PostgREST's server-side row cap on the returned set.
      return Promise.resolve({ data: inserted.slice(0, SERVER_MAX_ROWS), error: null });
    };
    self["insert"] = (rows: Record<string, unknown>[]) => {
      pendingInsert = rows;
      return self;
    };
    self["eq"] = () => self;
    self["maybeSingle"] = () =>
      Promise.resolve({ data: name === "content_packs" ? { id: "pack-1" } : null, error: null });
    return self;
  };
  return {
    supabase: {
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }),
        getSession: () => Promise.resolve({ data: { session: { user: { id: "user-1" } } } }),
      },
      from: (name: string) => table(name),
    },
  };
});

const { importLibraryEntries } = await import("@/lib/api");

function makeRow(i: number) {
  return {
    kind: "skill",
    name: `Entry ${i}`,
    category: null,
    summary: null,
    base_points: 1,
    cost_per_level: 0,
    max_levels: null,
    data: {},
    tags: [],
    pack: "Big Pack",
    source_label: "Test",
    source_edition: null,
    source_page: null,
    source_type: "user",
    visibility: "private",
  } as never;
}

describe("importLibraryEntries batches inserts past the server row cap (P0-05)", () => {
  it("returns exactly as many rows as were submitted for a >1000-row import", async () => {
    state.rows.length = 0;
    const rows = Array.from({ length: 1730 }, (_, i) => makeRow(i));
    const result = await importLibraryEntries(rows);
    expect(result.length).toBe(1730);
  });
});
