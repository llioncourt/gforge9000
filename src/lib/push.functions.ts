import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Public VAPID key the browser needs to create a push subscription. */
export const getPushPublicKey = createServerFn({ method: "GET" }).handler(async () => ({
  publicKey: process.env["VAPID_PUBLIC_KEY"] ?? null,
}));

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => {
    if (!input?.endpoint || !input.p256dh || !input.auth) throw new Error("Invalid subscription");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { endpoint: string }) => {
    if (!input?.endpoint) throw new Error("Invalid subscription");
    return input;
  })
  .handler(async ({ data, context }) => {
    await context.supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    return { ok: true };
  });

/** GM-only: pushes a reveal alert to one player's registered devices. */
export const sendRevealPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      campaignId: string;
      userId: string;
      title: string;
      body?: string;
      url?: string;
      tag?: string;
    }) => {
      if (!input?.campaignId || !input.userId || !input.title) throw new Error("Invalid push request");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { data: gmRow, error: gmError } = await context.supabase
      .from("campaign_members")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .eq("user_id", context.userId)
      .eq("role", "gm")
      .maybeSingle();
    if (gmError) throw new Error(gmError.message);
    if (!gmRow) throw new Error("Only the GM can send reveal alerts");

    const { data: member, error: memberError } = await context.supabase
      .from("campaign_members")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("Recipient is not a member of this campaign");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs, error: subsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", data.userId);
    if (subsError) throw new Error(subsError.message);
    if (!subs || subs.length === 0) return { sent: 0, removed: 0 };

    const { sendWebPush } = await import("@/lib/push.server");
    const results = await Promise.allSettled(
      subs.map((sub) =>
        sendWebPush(sub, {
          title: data.title,
          body: data.body,
          url: data.url,
          tag: data.tag,
        }),
      ),
    );

    const gone: string[] = [];
    let sent = 0;
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      if (result.value.ok) sent += 1;
      else if (result.value.gone) gone.push(result.value.endpoint);
    }
    if (gone.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", gone);
    }
    return { sent, removed: gone.length };
  });
