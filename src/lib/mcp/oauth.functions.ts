import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Signed-in calls backing the OAuth consent screen (/oauth-consent).
 * Tables are server-only, so both go through the admin client after the
 * auth middleware has established who the caller is.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- tables added after types were generated */

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export const getOAuthConsentInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ client_id: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<{ clientName: string | null }> => {
    const db = await adminDb();
    const { data: client } = await db
      .from("mcp_oauth_clients")
      .select("client_name")
      .eq("client_id", data.client_id)
      .maybeSingle();
    if (!client) throw new Error("Unknown application.");
    return { clientName: (client.client_name as string | null) ?? null };
  });

export const approveOAuthConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        client_id: z.string().min(1),
        redirect_uri: z.string().url(),
        code_challenge: z.string().min(1),
        state: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ redirectUrl: string }> => {
    const db = await adminDb();
    const { data: client } = await db
      .from("mcp_oauth_clients")
      .select("redirect_uris")
      .eq("client_id", data.client_id)
      .maybeSingle();
    if (!client) throw new Error("Unknown application.");
    if (!(client.redirect_uris as string[]).includes(data.redirect_uri)) {
      throw new Error("This connection request is not valid.");
    }

    const code = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const { error } = await db.from("mcp_oauth_codes").insert({
      code,
      client_id: data.client_id,
      user_id: context.userId,
      redirect_uri: data.redirect_uri,
      code_challenge: data.code_challenge,
      expires_at: new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString(),
    });
    if (error) throw new Error("Could not finish the connection. Please try again.");

    const redirect = new URL(data.redirect_uri);
    redirect.searchParams.set("code", code);
    if (data.state) redirect.searchParams.set("state", data.state);
    return { redirectUrl: redirect.toString() };
  });
