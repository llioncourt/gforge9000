import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import { decideProtectedAccess } from "@/lib/auth-guard";

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async () => {
    const decision = await decideProtectedAccess({
      getSession: () => supabase.auth.getSession(),
      getUser: () => supabase.auth.getUser(),
    });

    if (decision.outcome === "redirect") {
      throw redirect({ to: "/auth" });
    }

    return { user: decision.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
