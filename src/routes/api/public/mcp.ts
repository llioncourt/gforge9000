/**
 * Model Context Protocol endpoint (JSON-RPC 2.0 over HTTP).
 *
 * Public route: it authenticates the caller itself with a personal access key
 * (`Authorization: Bearer ucf_...`) instead of a site session. Every tool call
 * runs as the user that owns the key and re-checks campaign access.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROTOCOL_VERSION = "2025-06-18";

type Json = Record<string, unknown>;

function rpcResult(id: unknown, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status,
    headers: JSON_HEADERS,
  });
}

async function resolveUser(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const hash = createHash("sha256").update(token).digest("hex");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table added after types were generated
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("mcp_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;
  await db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id as string;
}

async function handle(request: Request): Promise<Response> {
  let body: Json;
  try {
    body = (await request.json()) as Json;
  } catch {
    return rpcError(null, -32700, "Parse error", 400);
  }

  const id = body["id"];
  const method = body["method"];

  if (typeof method !== "string") return rpcError(id, -32600, "Invalid request", 400);

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "gurps-forge-companion", version: "1.0.0" },
    });
  }

  if (method.startsWith("notifications/")) {
    return new Response(null, { status: 202, headers: JSON_HEADERS });
  }

  if (method === "ping") return rpcResult(id, {});

  const userId = await resolveUser(request);
  if (!userId) return rpcError(id, -32001, "Invalid or missing access key.", 401);

  const { TOOLS, TOOL_MAP } = await import("@/lib/mcp/tools.server");

  if (method === "tools/list") {
    return rpcResult(id, {
      tools: TOOLS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  }

  if (method === "tools/call") {
    const params = (body["params"] as Json | undefined) ?? {};
    const name = params["name"];
    const tool = typeof name === "string" ? TOOL_MAP.get(name) : undefined;
    if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(name)}`);
    const args = (params["arguments"] as Json | undefined) ?? {};
    try {
      const output = await tool.handler(args, userId);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: { result: output },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The action failed.";
      return rpcResult(id, {
        content: [{ type: "text", text: message }],
        isError: true,
      });
    }
  }

  return rpcError(id, -32601, `Unknown method: ${method}`);
}

export const Route = createFileRoute("/api/public/mcp")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      OPTIONS: async () => new Response(null, { status: 204, headers: JSON_HEADERS }),
      GET: async () =>
        new Response(JSON.stringify({ error: "Use POST for MCP requests." }), {
          status: 405,
          headers: JSON_HEADERS,
        }),
    },
  },
});
