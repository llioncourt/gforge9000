/**
 * RFC 9728 protected-resource metadata, served at the path-aware well-known
 * location that assistant clients probe first
 * (`/.well-known/oauth-protected-resource/api/public/mcp`).
 *
 * Built with the official helper — no hand-rolled OAuth logic.
 */

import { fromSupabaseUrl, resourceMetadataResponse } from "@supabase/server";
import { MCP_ENDPOINT_PATH } from "@/lib/mcp/config";

export function mcpResourceMetadataResponse(request: Request): Response {
  const supabaseUrl = process.env["SUPABASE_URL"];
  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured.");
  return resourceMetadataResponse(request, {
    resource: new URL(MCP_ENDPOINT_PATH, request.url).toString(),
    authorizationServers: [fromSupabaseUrl(supabaseUrl)],
  });
}
