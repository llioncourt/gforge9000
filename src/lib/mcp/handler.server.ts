/**
 * Assistant connection endpoint (MCP over HTTP).
 *
 * Composition, outermost first:
 *   withOAuthProtectedResource  — serves RFC 9728 discovery metadata and adds
 *                                 the WWW-Authenticate challenge to 401s
 *   withSupabase({auth:'user'}) — verifies the Bearer token and builds an
 *                                 RLS-scoped client for the caller
 *   createMcpHandler            — official SDK transport; a fresh McpServer is
 *                                 built per request (stateless)
 *
 * No service-role client is used anywhere below this boundary.
 */

import { createMcpHandler } from "@modelcontextprotocol/server";
import { fromSupabaseUrl, withOAuthProtectedResource, withSupabase } from "@supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MCP_ENDPOINT_PATH } from "@/lib/mcp/config";
import { buildMcpServer } from "@/lib/mcp/tools.server";

function authorizationServerUrl(): string {
  const url = process.env["SUPABASE_URL"];
  if (!url) throw new Error("SUPABASE_URL is not configured.");
  return fromSupabaseUrl(url);
}

const protectedHandler = withSupabase<Database>({ auth: "user" }, async (request, ctx) => {
  const userId = ctx.userClaims?.id ?? ctx.jwtClaims?.sub;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const handler = createMcpHandler(() =>
    buildMcpServer({
      supabase: ctx.supabase as SupabaseClient<Database>,
      userId,
    }),
  );
  try {
    return await handler.fetch(request);
  } finally {
    await handler.close?.();
  }
});

let composed: ((request: Request) => Promise<Response>) | undefined;

/** Entry point used by the public route. */
export function handleMcpRequest(request: Request): Promise<Response> {
  if (!composed) {
    composed = withOAuthProtectedResource(
      {
        resourceServer: (req: Request) => new URL(MCP_ENDPOINT_PATH, req.url).toString(),
        authorizationServer: authorizationServerUrl(),
      },
      protectedHandler,
    );
  }
  return composed(request);
}
