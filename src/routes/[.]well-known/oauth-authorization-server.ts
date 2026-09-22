/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414) so MCP clients can
 * discover the sign-in endpoints for /api/public/mcp.
 */
import { createFileRoute } from "@tanstack/react-router";
import { OAUTH_CORS_HEADERS, jsonResponse } from "@/lib/mcp/oauth.server";

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        return jsonResponse({
          issuer: origin,
          authorization_endpoint: `${origin}/api/public/oauth/authorize`,
          token_endpoint: `${origin}/api/public/oauth/token`,
          registration_endpoint: `${origin}/api/public/oauth/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
          scopes_supported: ["mcp"],
        });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS }),
    },
  },
});
