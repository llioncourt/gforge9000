/**
 * OAuth 2.1 helpers for the MCP endpoint (server-only).
 *
 * Lets MCP clients that cannot send a static personal key (e.g. claude.ai web
 * connectors) connect through a standard authorization-code + PKCE sign-in.
 * Personal keys (ucf_...) keep working unchanged.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_CORS_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
} as const;

export const ACCESS_TOKEN_PREFIX = "mcpo_";
export const REFRESH_TOKEN_PREFIX = "mcpr_";
/** Access tokens live 30 days; refresh tokens are rotated on every use. */
export const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTH_CODE_TTL_MS = 10 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("hex")}`;
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: OAUTH_CORS_HEADERS });
}

export function oauthError(error: string, description: string, status = 400): Response {
  return jsonResponse({ error, error_description: description }, status);
}

type Db = {
  from: (table: string) => never;
};

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables added after types were generated
  return supabaseAdmin as any as {
    from: (table: string) => any;
  } & Db;
}

/** Resolve the user behind a Bearer token: personal key (ucf_) or OAuth access token (mcpo_). */
export async function resolveBearerUser(token: string): Promise<string | null> {
  if (!token) return null;
  const db = await adminDb();
  const hash = hashToken(token);

  if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
    const { data, error } = await db
      .from("mcp_oauth_tokens")
      .select("id, user_id, expires_at, revoked_at")
      .eq("access_token_hash", hash)
      .maybeSingle();
    if (error || !data || data.revoked_at) return null;
    if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;
    return data.user_id as string;
  }

  const { data, error } = await db
    .from("mcp_tokens")
    .select("id, user_id, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;
  await db.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id as string;
}

export async function issueTokenPair(
  userId: string,
  clientId: string,
): Promise<{ access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string }> {
  const db = await adminDb();
  const accessToken = generateToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = generateToken(REFRESH_TOKEN_PREFIX);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString();
  const { error } = await db.from("mcp_oauth_tokens").insert({
    user_id: userId,
    client_id: clientId,
    access_token_hash: hashToken(accessToken),
    refresh_token_hash: hashToken(refreshToken),
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: "mcp",
  };
}
