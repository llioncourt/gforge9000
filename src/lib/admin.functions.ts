import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

async function assertAdmin(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("This action is not available.");
}

export const getIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return Boolean(data);
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;

    const users: User[] = [];
    for (let page = 1; page < 50; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      users.push(...data.users);
      if (data.users.length < 1000) break;
    }

    const [profiles, roles, campaigns, members, characters] = await Promise.all([
      db.from("profiles").select("id, display_name"),
      db.from("user_roles").select("user_id, role"),
      db
        .from("campaigns")
        .select("id, name, gm_id, created_at")
        .order("created_at", { ascending: false }),
      db.from("campaign_members").select("campaign_id, user_id"),
      db.from("characters").select("id, owner_id, campaign_id"),
    ]);

    const nameOf = new Map<string, string>(
      (profiles.data ?? []).map((p) => [p.id, p.display_name ?? ""]),
    );
    const count = <K extends string>(
      rows: Array<Record<K, string | null>> | null,
      key: K,
      id: string,
    ) => (rows ?? []).filter((r) => r[key] === id).length;

    return {
      users: users.map((u) => ({
        id: u.id as string,
        email: (u.email ?? "") as string,
        name: nameOf.get(u.id) ?? "",
        createdAt: u.created_at as string,
        lastSignIn: (u.last_sign_in_at ?? null) as string | null,
        blocked: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
        isAdmin: (roles.data ?? []).some((r) => r.user_id === u.id && r.role === "admin"),
        characters: count(characters.data, "owner_id", u.id),
        campaigns: count(members.data, "user_id", u.id),
      })),
      campaigns: (campaigns.data ?? []).map(
        (
          c,
        ): {
          id: string;
          name: string;
          gm: string;
          createdAt: string;
          members: number;
          characters: number;
        } => ({
          id: c.id as string,
          name: c.name as string,
          gm: nameOf.get(c.gm_id) ?? "",
          createdAt: c.created_at as string,
          members: count(members.data, "campaign_id", c.id),
          characters: count(characters.data, "campaign_id", c.id),
        }),
      ),
    };
  });

export const setUserBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), blocked: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    if (data.userId === context.userId) throw new Error("You cannot block yourself.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.blocked ? "876000h" : "none",
    });
    if (error) throw error;
    return { ok: true };
  });

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw error;
    return { ok: true };
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), admin: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    if (data.userId === context.userId && !data.admin)
      throw new Error("You cannot remove your own admin access.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin;
    const { error } = data.admin
      ? await db
          .from("user_roles")
          .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" })
      : await db.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    if (error) throw error;
    return { ok: true };
  });
