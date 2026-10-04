import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A scriptable stand-in for the database client: every `from(table)` call
 * returns a chain whose awaited value is produced by `respond`, and `rpc`
 * calls go through `rpc`.
 */
const script = vi.hoisted(() => ({
  respond: (_table: string, _calls: [string, unknown[]][]) =>
    ({ data: [], error: null }) as { data: unknown; error: { message: string } | null },
  rpc: undefined as
    undefined | ((fn: string) => Promise<{ data: unknown; error: { message: string } | null }>),
  log: [] as { table: string; calls: [string, unknown[]][] }[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => {
    const calls: [string, unknown[]][] = [];
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "order", "range"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      };
    }
    chain["then"] = (resolve: (value: unknown) => unknown) => {
      script.log.push({ table: name, calls });
      return Promise.resolve(script.respond(name, calls)).then(resolve);
    };
    return chain;
  };
  return {
    supabase: {
      from: (name: string) => table(name),
      get rpc() {
        return script.rpc;
      },
    },
  };
});

const { listCampaignEntries, listLibraryPackNames } = await import("@/lib/api");

beforeEach(() => {
  script.log.length = 0;
  script.rpc = undefined;
  script.respond = () => ({ data: [], error: null });
});

describe("campaign entries are read by campaign, not after the roster", () => {
  it("asks once, filtered by the campaign, and returns plain entry rows", async () => {
    script.respond = (table) =>
      table === "character_entries"
        ? {
            data: [
              { id: "e1", character_id: "c1", name: "Brawling", characters: { campaign_id: "k" } },
              { id: "e2", character_id: "c2", name: "Guns", characters: { campaign_id: "k" } },
            ],
            error: null,
          }
        : { data: [], error: null };

    const rows = await listCampaignEntries("k");

    expect(rows).toEqual([
      { id: "e1", character_id: "c1", name: "Brawling" },
      { id: "e2", character_id: "c2", name: "Guns" },
    ]);
    expect(script.log.map((entry) => entry.table)).toEqual(["character_entries"]);
    expect(script.log[0]!.calls).toContainEqual(["eq", ["characters.campaign_id", "k"]]);
  });

  it("keeps reading while pages come back full", async () => {
    const page = (start: number, size: number) =>
      Array.from({ length: size }, (_, i) => ({
        id: `e${start + i}`,
        character_id: "c1",
        characters: { campaign_id: "k" },
      }));
    script.respond = (_table, calls) => {
      const range = calls.find(([method]) => method === "range")![1] as [number, number];
      return { data: range[0] === 0 ? page(0, 1000) : page(1000, 3), error: null };
    };

    const rows = await listCampaignEntries("k");

    expect(rows).toHaveLength(1003);
    expect(script.log).toHaveLength(2);
  });

  it("falls back to the two-step read if the joined filter is refused", async () => {
    script.respond = (table, calls) => {
      if (table === "characters") return { data: [{ id: "c1" }, { id: "c2" }], error: null };
      if (calls.some(([method]) => method === "in")) {
        return { data: [{ id: "e9", character_id: "c2" }], error: null };
      }
      return { data: null, error: { message: "relationship not found" } };
    };

    const rows = await listCampaignEntries("k");

    expect(rows).toEqual([{ id: "e9", character_id: "c2" }]);
    expect(script.log.map((entry) => entry.table)).toEqual([
      "character_entries",
      "characters",
      "character_entries",
    ]);
  });
});

describe("library pack names", () => {
  it("uses the direct list when the database offers it", async () => {
    script.rpc = async (fn) => {
      expect(fn).toBe("list_library_pack_names");
      return { data: ["Basic Set", "", null, "Magic"], error: null };
    };

    expect(await listLibraryPackNames()).toEqual(["Basic Set", "Magic"]);
    expect(script.log).toHaveLength(0);
  });

  it("walks the catalogue when the direct list is missing or fails", async () => {
    script.respond = () => ({
      data: [{ pack: "Basic Set" }, { pack: null }, { pack: "Magic" }, { pack: "Basic Set" }],
      error: null,
    });

    script.rpc = undefined;
    expect(await listLibraryPackNames()).toEqual(["Basic Set", "Magic"]);

    script.rpc = async () => ({ data: null, error: { message: "function does not exist" } });
    expect(await listLibraryPackNames()).toEqual(["Basic Set", "Magic"]);
  });
});
