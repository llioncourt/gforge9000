import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The library list omits the heavy `data` blob; add-to-sheet and export re-attach
 * it on demand. These tests lock that contract so neither path silently exports
 * or adds an entry without its details.
 */

type Row = { id: string; name: string; data?: Record<string, unknown> };

const rows: Row[] = [
  { id: "a", name: "Axe", data: { attribute: "DX" } },
  { id: "b", name: "Bow", data: { attribute: "ST" } },
  { id: "c", name: "Cudgel", data: { attribute: "IQ" } },
];

const selected = vi.fn<(ids: string[]) => Row[]>();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (_col: string, ids: string[]) => ({ data: selected(ids), error: null }),
        order: () => ({
          order: () => ({
            range: (from: number, to: number) => ({
              data: rows.slice(from, to + 1).map(({ id, name }) => ({ id, name })),
              error: null,
            }),
          }),
        }),
      }),
    }),
  },
}));

beforeEach(() => {
  selected.mockImplementation((ids) => rows.filter((r) => ids.includes(r.id)).reverse());
});

describe("library payload split", () => {
  it("list rows carry no detail blob", async () => {
    const { listLibrary } = await import("@/lib/api");
    const list = await listLibrary();
    expect(list).toHaveLength(3);
    expect(list.every((row) => !("data" in row))).toBe(true);
  });

  it("re-attaches details in the original list order", async () => {
    const { withLibraryDetails } = await import("@/lib/api");
    const hydrated = await withLibraryDetails([
      { id: "c" },
      { id: "a" },
    ]);
    expect(hydrated.map((r) => r.id)).toEqual(["c", "a"]);
    expect(hydrated[0]!.data).toEqual({ attribute: "IQ" });
    expect(hydrated[1]!.data).toEqual({ attribute: "DX" });
  });

  it("falls back to an empty blob when an entry has no details", async () => {
    const { withLibraryDetails } = await import("@/lib/api");
    const hydrated = await withLibraryDetails([{ id: "missing" }]);
    expect(hydrated[0]!.data).toEqual({});
  });

  it("fetches details only for the requested entries", async () => {
    const { getLibraryEntries } = await import("@/lib/api");
    await getLibraryEntries(["b"]);
    expect(selected).toHaveBeenCalledWith(["b"]);
  });
});
