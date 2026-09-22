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
import { MCP_ENDPOINT_PATH, MCP_RESOURCE_METADATA_PATH } from "@/lib/mcp/config";
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

/**
 * Point the 401 challenge at the RFC 9728 path-aware location we actually
 * serve. The outer middleware leaves an existing header alone.
 */
async function challengeAwareHandler(request: Request): Promise<Response> {
  const response = await protectedHandler(request);
  if (response.status !== 401 || response.headers.has("www-authenticate")) return response;
  const metadataUrl = new URL(MCP_RESOURCE_METADATA_PATH, request.url).toString();
  const headers = new Headers(response.headers);
  headers.set("www-authenticate", `Bearer resource_metadata="${metadataUrl}"`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

let composed: ((request: Request) => Promise<Response>) | undefined;

/** Entry point used by the public route. */
export function handleMcpRequest(request: Request): Promise<Response> {
  if (!composed) {
    composed = withOAuthProtectedResource(
      {
        resourceServer: (req: Request) => new URL(MCP_ENDPOINT_PATH, req.url).toString(),
        authorizationServer: authorizationServerUrl(),
      },
      challengeAwareHandler,
    );
  }
  return composed(request);
}
