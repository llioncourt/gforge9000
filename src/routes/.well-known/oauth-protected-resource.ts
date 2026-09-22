/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP endpoint.
 * Advertised via the WWW-Authenticate header on 401 responses.
 */
import { createFileRoute } from "@tanstack/react-router";
import { OAUTH_CORS_HEADERS, jsonResponse } from "@/lib/mcp/oauth.server";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        return jsonResponse({
          resource: `${origin}/api/public/mcp`,
          authorization_servers: [origin],
          bearer_methods_supported: ["header"],
          scopes_supported: ["mcp"],
        });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS }),
    },
  },
});
