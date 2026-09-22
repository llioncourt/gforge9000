/**
 * OAuth 2.1 token endpoint for MCP clients.
 *
 * Supports the authorization_code grant (with PKCE S256 verification) and the
 * refresh_token grant (rotating). Tokens are stored hashed; the raw values are
 * only ever returned here.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  ACCESS_TOKEN_PREFIX,
  OAUTH_CORS_HEADERS,
  generateToken,
  hashToken,
  issueTokenPair,
  jsonResponse,
  oauthError,
  verifyPkceS256,
  REFRESH_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_MS,
} from "@/lib/mcp/oauth.server";

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables added after types were generated
  return supabaseAdmin as any;
}

async function handleAuthorizationCode(form: URLSearchParams): Promise<Response> {
  const code = form.get("code");
  const clientId = form.get("client_id");
  const redirectUri = form.get("redirect_uri");
  const verifier = form.get("code_verifier");
  if (!code || !clientId || !redirectUri || !verifier) {
    return oauthError("invalid_request", "code, client_id, redirect_uri and code_verifier are required.");
  }

  const db = await adminDb();
  const { data: row } = await db
    .from("mcp_oauth_codes")
    .select("code, client_id, user_id, redirect_uri, code_challenge, expires_at, used_at")
    .eq("code", code)
    .maybeSingle();

  if (!row || row.used_at) return oauthError("invalid_grant", "This code is invalid or was already used.");
  if (new Date(row.expires_at as string).getTime() <= Date.now()) {
    return oauthError("invalid_grant", "This code has expired. Please sign in again.");
  }
  if (row.client_id !== clientId || row.redirect_uri !== redirectUri) {
    return oauthError("invalid_grant", "The code does not match this client or redirect.");
  }
  if (!verifyPkceS256(verifier, row.code_challenge as string)) {
    return oauthError("invalid_grant", "PKCE verification failed.");
  }

  const { error: markError } = await db
    .from("mcp_oauth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_at", null);
  if (markError) return oauthError("invalid_grant", "This code was already used.");

  return jsonResponse(await issueTokenPair(row.user_id as string, clientId));
}

async function handleRefreshToken(form: URLSearchParams): Promise<Response> {
  const refreshToken = form.get("refresh_token");
  const clientId = form.get("client_id");
  if (!refreshToken || !clientId || !refreshToken.startsWith(REFRESH_TOKEN_PREFIX)) {
    return oauthError("invalid_request", "A valid refresh_token and client_id are required.");
  }

  const db = await adminDb();
  const { data: row } = await db
    .from("mcp_oauth_tokens")
    .select("id, user_id, client_id, revoked_at")
    .eq("refresh_token_hash", hashToken(refreshToken))
    .maybeSingle();
  if (!row || row.revoked_at || row.client_id !== clientId) {
    return oauthError("invalid_grant", "This refresh token is invalid. Please sign in again.");
  }

  // Rotate: revoke the old pair, issue a new one.
  await db.from("mcp_oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", row.id);
  void generateToken;
  void ACCESS_TOKEN_PREFIX;
  void ACCESS_TOKEN_TTL_MS;
  return jsonResponse(await issueTokenPair(row.user_id as string, clientId));
}

export const Route = createFileRoute("/api/public/oauth/token")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = new URLSearchParams(await request.text());
        const grantType = form.get("grant_type");
        try {
          if (grantType === "authorization_code") return await handleAuthorizationCode(form);
          if (grantType === "refresh_token") return await handleRefreshToken(form);
          return oauthError("unsupported_grant_type", "Supported grants: authorization_code, refresh_token.");
        } catch {
          return oauthError("server_error", "Could not issue a token. Please try again.", 500);
        }
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS }),
    },
  },
});
