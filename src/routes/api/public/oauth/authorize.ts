/**
 * OAuth 2.1 authorization endpoint for MCP clients.
 *
 * Validates the request and redirects to the in-app consent screen
 * (/oauth-consent), which requires a signed-in user. After consent the user is
 * redirected back to the client's redirect_uri with an authorization code.
 */
import { createFileRoute } from "@tanstack/react-router";
import { OAUTH_CORS_HEADERS, oauthError } from "@/lib/mcp/oauth.server";

export const Route = createFileRoute("/api/public/oauth/authorize")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const params = url.searchParams;

        const responseType = params.get("response_type");
        const clientId = params.get("client_id");
        const redirectUri = params.get("redirect_uri");
        const state = params.get("state");
        const codeChallenge = params.get("code_challenge");
        const challengeMethod = params.get("code_challenge_method");
        const scope = params.get("scope") ?? "mcp";

        const deny = (error: string, description: string) => {
          if (redirectUri) {
            const target = new URL(redirectUri);
            target.searchParams.set("error", error);
            target.searchParams.set("error_description", description);
            if (state) target.searchParams.set("state", state);
            return new Response(null, { status: 302, headers: { Location: target.toString() } });
          }
          return oauthError(error, description);
        };

        if (responseType !== "code") {
          return deny("unsupported_response_type", "Only response_type=code is supported.");
        }
        if (!clientId) return oauthError("invalid_request", "client_id is required.");
        if (!redirectUri) return oauthError("invalid_request", "redirect_uri is required.");
        if (!codeChallenge || challengeMethod !== "S256") {
          return deny("invalid_request", "PKCE with S256 code_challenge is required.");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table added after types were generated
        const db = supabaseAdmin as any;
        const { data: client } = await db
          .from("mcp_oauth_clients")
          .select("client_id, redirect_uris")
          .eq("client_id", clientId)
          .maybeSingle();
        if (!client) return oauthError("invalid_client", "Unknown client_id.");
        if (!(client.redirect_uris as string[]).includes(redirectUri)) {
          return oauthError("invalid_request", "redirect_uri is not registered for this client.");
        }

        const consent = new URL("/oauth-consent", url.origin);
        consent.searchParams.set("client_id", clientId);
        consent.searchParams.set("redirect_uri", redirectUri);
        consent.searchParams.set("code_challenge", codeChallenge);
        consent.searchParams.set("code_challenge_method", "S256");
        consent.searchParams.set("scope", scope);
        if (state) consent.searchParams.set("state", state);

        return new Response(null, { status: 302, headers: { Location: consent.toString() } });
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS }),
    },
  },
});
