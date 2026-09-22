import { describe, expect, it } from "vitest";
import {
  MCP_GM_ONLY_FIELDS,
  MCP_MAX_LIMIT,
  MCP_TOOL_NAMES,
  __stripGmFields,
  buildMcpServer,
} from "@/lib/mcp/tools.server";

function fakeContext() {
  return {
    // Never used by the assertions below — building the server only registers tools.
    supabase: {} as never,
    userId: "00000000-0000-0000-0000-000000000001",
  };
}

describe("assistant tool surface", () => {
  it("registers exactly the documented tools", () => {
    const server = buildMcpServer(fakeContext());
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
    );
    expect(registered.sort()).toEqual([...MCP_TOOL_NAMES].sort());
    expect(registered).toHaveLength(15);
  });

  it("marks read tools read-only and delete tools destructive", () => {
    const server = buildMcpServer(fakeContext());
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { annotations?: Record<string, boolean> }>;
      }
    )._registeredTools;

    for (const name of ["list_campaigns", "list_entries", "get_entry", "get_character"]) {
      expect(tools[name]?.annotations?.["readOnlyHint"]).toBe(true);
    }
    for (const name of ["delete_entry", "delete_character_entry"]) {
      expect(tools[name]?.annotations?.["destructiveHint"]).toBe(true);
      expect(tools[name]?.annotations?.["readOnlyHint"]).toBe(false);
    }
  });

  it("validates tool input and rejects unbounded limits", () => {
    const server = buildMcpServer(fakeContext());
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { inputSchema?: { safeParse: (value: unknown) => { success: boolean } } }
        >;
      }
    )._registeredTools;

    const listEntries = tools["list_entries"]?.inputSchema;
    expect(listEntries).toBeDefined();
    expect(listEntries!.safeParse({ campaign_id: "not-a-uuid" }).success).toBe(false);
    expect(
      listEntries!.safeParse({
        campaign_id: "11111111-1111-4111-8111-111111111111",
        limit: MCP_MAX_LIMIT + 1,
      }).success,
    ).toBe(false);
    expect(
      listEntries!.safeParse({
        campaign_id: "11111111-1111-4111-8111-111111111111",
        limit: MCP_MAX_LIMIT,
      }).success,
    ).toBe(true);
  });
});

describe("game master fields", () => {
  const entity = { id: "e1", name: "Vault", gm_notes: "secret", summary: "public" };

  it("removes gm notes for players", () => {
    const out = __stripGmFields(entity, false, MCP_GM_ONLY_FIELDS.entity);
    expect(out).not.toHaveProperty("gm_notes");
    expect(out["summary"]).toBe("public");
  });

  it("keeps gm notes for the game master", () => {
    const out = __stripGmFields(entity, true, MCP_GM_ONLY_FIELDS.entity);
    expect(out["gm_notes"]).toBe("secret");
  });

  it("removes gm descriptions from relationships for players", () => {
    const out = __stripGmFields(
      { id: "r1", rel_type: "ally", gm_description: "secret" },
      false,
      MCP_GM_ONLY_FIELDS.relationship,
    );
    expect(out).not.toHaveProperty("gm_description");
  });

  it("does not mutate the source row", () => {
    __stripGmFields(entity, false, MCP_GM_ONLY_FIELDS.entity);
    expect(entity.gm_notes).toBe("secret");
  });
});
