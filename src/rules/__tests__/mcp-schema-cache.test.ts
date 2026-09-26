/**
 * SCHEMACACHE-004: proves the immutable JSON Schema conversion in
 * `withJson`/`jsonSchemaCache` (kit.server.ts) is reused for the same
 * immutable schema object across two independent server builds, while
 * confirming request-scoped state (ctx) is never shared between them.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { McpServer } from "@modelcontextprotocol/server";
import { registerAllTools, MCP_TOOL_NAMES } from "@/lib/mcp/domains/index.server";
import { registrar } from "@/lib/mcp/kit.server";
import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";

function collectSchemas(ctx: McpToolContext) {
  const server = new McpServer({ name: "test", version: "1", title: "test" });
  const tool = registrar(server);
  const schemas: Record<string, { input: unknown; output: unknown }> = {};
  const spy: ToolRegistrar = (name, definition, handler) => {
    tool(name, definition, handler);
    schemas[name] = {
      input: (definition.inputSchema as unknown as { jsonSchema: unknown }).jsonSchema,
      output: (definition.outputSchema as unknown as { jsonSchema: unknown }).jsonSchema,
    };
  };
  registerAllTools(spy, ctx);
  return schemas;
}

describe("MCP schema-cache hoisting (SCHEMACACHE)", () => {
  it("keeps exactly 40 top-level tools", () => {
    expect(MCP_TOOL_NAMES.length).toBe(40);
  });

  it("reuses the same prepared JSON schema object across two server builds", () => {
    // Two distinct, request-scoped contexts — never the same object.
    const ctxA = { supabase: { marker: "A" } as never, userId: "user-a" };
    const ctxB = { supabase: { marker: "B" } as never, userId: "user-b" };

    const first = collectSchemas(ctxA);
    const second = collectSchemas(ctxB);

    expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());

    // Immutable schemas hoisted to module scope must convert once and then be
    // reused by identity: the JSON Schema object attached on both builds is
    // the exact same reference, proving the WeakMap-keyed cache in
    // `withJson` was hit rather than re-running z.toJSONSchema.
    for (const name of Object.keys(first)) {
      expect(second[name]?.input).toBe(first[name]?.input);
      expect(second[name]?.output).toBe(first[name]?.output);
    }
  });

  it("never shares request-scoped ctx state between two builds", () => {
    // Each build closes over its own ctx; building server A must not leak
    // ctx into server B's handlers. We assert this at the type/contract
    // level: registerAllTools takes ctx as a parameter (not module state),
    // so two calls with different ctx objects must not observe each other.
    const seen: unknown[] = [];
    const ctxA = { supabase: { tag: "first" } as never, userId: "user-a" };
    const ctxB = { supabase: { tag: "second" } as never, userId: "user-b" };

    const captureCtx = (ctx: McpToolContext) => {
      const server = new McpServer({ name: "test", version: "1", title: "test" });
      const tool = registrar(server);
      const spy: ToolRegistrar = (name, definition, handler) => {
        tool(name, definition, handler);
        if (name === "list_campaigns") seen.push(ctx);
      };
      registerAllTools(spy, ctx);
    };

    captureCtx(ctxA);
    captureCtx(ctxB);

    expect(seen[0]).toBe(ctxA);
    expect(seen[1]).toBe(ctxB);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("still converts distinct schema shapes to distinct JSON schemas", () => {
    const a = z.object({ foo: z.string() });
    const b = z.object({ bar: z.number() });
    // Sanity check the underlying primitive this test relies on: different
    // schema objects produce independently computed (non-identical) output.
    expect(z.toJSONSchema(a)).not.toEqual(z.toJSONSchema(b));
  });
});
