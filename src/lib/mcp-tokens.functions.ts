import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Personal access keys used by outside assistants.
 * Only a fingerprint is stored: the key itself is shown once, at creation.
 */

export interface McpTokenRow {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- table added after types were generated */

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const listMcpTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<McpTokenRow[]> => {
    const { data, error } = await (context.supabase as any)
      .from("mcp_tokens")
      .select("id, name, token_prefix, created_at, last_used_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as McpTokenRow[];
  });

export const createMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().min(1).max(60) }).parse(input))
  .handler(async ({ data, context }): Promise<{ token: string }> => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const token = `ucf_${secret}`;
    const { error } = await (context.supabase as any).from("mcp_tokens").insert({
      user_id: context.userId,
      name: data.name,
      token_hash: await sha256(token),
      token_prefix: token.slice(0, 12),
    });
    if (error) throw new Error(error.message);
    return { token };
  });

export const revokeMcpToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("mcp_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
