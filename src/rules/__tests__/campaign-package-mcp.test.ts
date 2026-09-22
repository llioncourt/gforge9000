import { describe, expect, it } from "vitest";
import { buildMcpServer } from "@/lib/mcp/tools.server";

/**
 * Focused coverage for the campaign_package export/import wiring (TD-001).
 * Uses a minimal fake Supabase client rather than a real database — only the
 * methods the domain actually calls are implemented.
 */

type Row = Record<string, unknown>;
type Resolve = (value: { data: unknown; error: unknown }) => unknown;
/** The fake stands in for a Supabase client; the shapes are structural, not nominal. */
type FakeSupabase = Parameters<typeof buildMcpServer>[0]["supabase"];

function makeFakeSupabase(opts: { campaigns: Row[]; storageFiles: Map<string, Uint8Array> }) {
  const { campaigns, storageFiles } = opts;
  const inserted: Record<string, Row[]> = {};

  function table(name: string) {
    const state: { filters: [string, unknown][] } = { filters: [] };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        state.filters.push([col, val]);
        return builder;
      },
      order: () => builder,
      in: () => builder,
      maybeSingle: async () => {
        if (name === "campaigns") {
          const row = campaigns.find((c) => state.filters.every(([k, v]) => c[k] === v));
          return { data: row ?? null, error: null };
        }
        return { data: null, error: null };
      },
      single: async () => {
        if (name === "campaigns") {
          const row = campaigns.find((c) => state.filters.every(([k, v]) => c[k] === v));
          return { data: row ?? null, error: row ? null : { message: "not found" } };
        }
        return { data: null, error: { message: "unsupported" } };
      },
      insert: (payload: Row | Row[]) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        inserted[name] = [...(inserted[name] ?? []), ...rows];
        const withIds = rows.map((r) => ({ id: crypto.randomUUID(), ...r }));
        if (name === "campaigns") campaigns.push(...(withIds as Row[]));
        return {
          select: () => ({
            single: async () => ({ data: withIds[0], error: null }),
          }),
          then: (resolve: Resolve) => resolve({ data: withIds, error: null }),
        };
      },
      update: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
      delete: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
      then: (resolve: Resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }

  const storage = {
    from: (bucket: string) => ({
      download: async (path: string) => {
        const bytes = storageFiles.get(`${bucket}/${path}`);
        if (!bytes) return { data: null, error: { message: "not found" } };
        return { data: { arrayBuffer: async () => bytes.slice().buffer }, error: null };
      },
      upload: async (path: string, bytes: Uint8Array) => {
        storageFiles.set(`${bucket}/${path}`, bytes);
        return { data: { path }, error: null };
      },
      list: async (_folder: string, opts: { search: string }) => {
        const match = [...storageFiles.keys()].some((k) => k.endsWith(opts.search));
        return {
          data: match
            ? [{ name: opts.search, metadata: { size: 10, mimetype: "application/zip" } }]
            : [],
          error: null,
        };
      },
      remove: async (paths: string[]) => {
        for (const p of paths) storageFiles.delete(`${bucket}/${p}`);
        return { data: null, error: null };
      },
      createSignedUrl: async (path: string) => ({
        data: { signedUrl: `https://signed.example/${bucket}/${path}` },
        error: null,
      }),
      createSignedUploadUrl: async (path: string) => ({
        data: { signedUrl: `https://upload.example/${bucket}/${path}`, token: "tok" },
        error: null,
      }),
    }),
  };

  return { from: table, storage, __inserted: inserted } as unknown as FakeSupabase;
}

type RegisteredTool = {
  handler: (input: Record<string, unknown>) => Promise<unknown>;
};

async function getTool(server: ReturnType<typeof buildMcpServer>, name: string) {
  const bag = server as unknown as {
    _registeredTools?: Record<string, RegisteredTool>;
    tools?: Record<string, RegisteredTool>;
  };
  const tools = bag._registeredTools ?? bag.tools;
  return tools?.[name];
}

describe("campaign_package MCP tool (export/import wiring)", () => {
  it("export requires the caller to be the campaign GM", async () => {
    const userId = "user-1";
    const campaigns: Row[] = [
      { id: "camp-1", name: "Not Mine", gm_id: "someone-else", settings: {} },
    ];
    const supabase = makeFakeSupabase({ campaigns, storageFiles: new Map() });
    const server = buildMcpServer({ supabase, userId } as unknown as Parameters<typeof buildMcpServer>[0]);
    const tool = await getTool(server, "campaign_package");
    expect(tool).toBeTruthy();
    await expect(tool.handler({ action: "export", campaign_id: "camp-1" })).rejects.toThrow(
      /Game Master/,
    );
  });

  it("import rejects a staged path outside the caller's own prefix", async () => {
    const userId = "user-1";
    const supabase = makeFakeSupabase({ campaigns: [], storageFiles: new Map() });
    const server = buildMcpServer({ supabase, userId } as unknown as Parameters<typeof buildMcpServer>[0]);
    const tool = await getTool(server, "campaign_package");
    await expect(
      tool.handler({ action: "import", storage_path: "other-user/file.zip" }),
    ).rejects.toThrow(/does not belong to you/);
  });
});
