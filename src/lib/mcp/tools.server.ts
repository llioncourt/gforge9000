/**
 * Tool surface exposed to external assistants over MCP.
 *
 * Every tool runs against the RLS-scoped Supabase client built from the
 * caller's own access token — there is no service-role access anywhere in
 * this path. On top of RLS, the application's own Game Master / owner rules
 * are checked explicitly so a write never depends on a policy alone.
 *
 * This file is a thin composition root: the 40 tools themselves live in
 * `src/lib/mcp/domains/*.server.ts`, registered through the single registry
 * in `src/lib/mcp/domains/index.server.ts`. `MCP_TOOL_NAMES` is re-exported
 * from that registry so it can never drift from what actually gets
 * registered.
 */

import { McpServer } from "@modelcontextprotocol/server";
import { registerAllTools, MCP_TOOL_NAMES } from "@/lib/mcp/domains/index.server";
import { registrar } from "@/lib/mcp/kit.server";
import type { McpToolContext } from "@/lib/mcp/kit.server";
import { MCP_GM_ONLY_FIELDS, __stripGmFields } from "@/lib/mcp/domains/shared.server";

export const MCP_SERVER_NAME = "universal-character-forge";
export const MCP_SERVER_VERSION = "2.0.0";

export { MCP_MAX_LIMIT } from "@/lib/mcp/kit.server";
export type { McpToolContext } from "@/lib/mcp/kit.server";
export { MCP_TOOL_NAMES, MCP_GM_ONLY_FIELDS, __stripGmFields };

export function buildMcpServer(ctx: McpToolContext): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    title: "Universal Character Forge",
  });

  const tool = registrar(server);
  registerAllTools(tool, ctx);

  return server;
}
