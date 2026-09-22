/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591) for MCP clients.
 *
 * Public clients (PKCE, no secret): accepts a client_name and redirect_uris and
 * returns a client_id. No authentication — registered clients only identify the
 * connecting app; access always requires the user's own consent sign-in.
 */
import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";
import { OAUTH_CORS_HEADERS, jsonResponse, oauthError } from "@/lib/mcp/oauth.server";

const MAX_REDIRECT_URIS = 10;

export const Route = createFileRoute("/api/public/oauth/register")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return oauthError("invalid_client_metadata", "Body must be JSON.");
        }

        const rawUris = body["redirect_uris"];
        if (
          !Array.isArray(rawUris) ||
          rawUris.length === 0 ||
          rawUris.length > MAX_REDIRECT_URIS ||
          rawUris.some((uri) => {
            if (typeof uri !== "string") return true;
            try {
              const parsed = new URL(uri);
              return parsed.protocol !== "https:" && parsed.hostname !== "localhost";
            } catch {
              return true;
            }
          })
        ) {
          return oauthError(
            "invalid_redirect_uri",
            "redirect_uris must be 1-10 https URLs (localhost allowed).",
          );
        }
        const redirectUris = rawUris as string[];

        const clientName =
          typeof body["client_name"] === "string"
            ? (body["client_name"] as string).slice(0, 120)
            : null;
        const clientId = randomUUID();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table added after types were generated
        const db = supabaseAdmin as any;
        const { error } = await db.from("mcp_oauth_clients").insert({
          client_id: clientId,
          client_name: clientName,
          redirect_uris: redirectUris,
        });
        if (error) return oauthError("server_error", "Could not register the client.", 500);

        return jsonResponse(
          {
            client_id: clientId,
            client_id_issued_at: Math.floor(Date.now() / 1000),
            client_name: clientName,
            redirect_uris: redirectUris,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          },
          201,
        );
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS }),
    },
  },
});
