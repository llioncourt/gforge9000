import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { logAuthEvent } from "@/lib/auth-diagnostics";

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async () => {
    // Prefer the locally hydrated session first. Right after sign-in
    // (password or OAuth), the session has already been persisted to local
    // storage by supabase-js before SIGNED_IN observers run, so this never
    // does a network round-trip and can't race the token handoff. Falling
    // back straight to `getUser()` (a network call) here is what caused
    // just-authenticated users to be bounced back to /auth in Edge/Firefox
    // whenever that request was slow or briefly failed during the handoff.
    const { data: sessionData } = await supabase.auth.getSession();
    logAuthEvent("guard:getSession", { hasSession: Boolean(sessionData.session) });

    if (sessionData.session) {
      logAuthEvent("guard:decision", { outcome: "allow", source: "local-session" });
      return { user: sessionData.session.user };
    }

    // No locally hydrated session: fall back to asking the server directly,
    // which also covers a session restored from a cookie/broker without a
    // local copy yet.
    const { data, error } = await supabase.auth.getUser();
    logAuthEvent("guard:getUser", { ok: !error && Boolean(data.user) });

    if (error || !data.user) {
      logAuthEvent("guard:decision", { outcome: "redirect" });
      throw redirect({ to: "/auth" });
    }

    logAuthEvent("guard:decision", { outcome: "allow", source: "getUser" });
    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
