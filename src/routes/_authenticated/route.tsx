import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Reads (and silently refreshes) the stored session locally instead of a
    // network round-trip per navigation. Access is still enforced server-side.
    const { data, error } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (error || !user) {
      // `location.search` is a parsed object here — use the raw query string.
      const target = `${location.pathname}${location.searchStr ?? ""}`;
      throw redirect({ to: "/auth", search: { redirect: target } });
    }
    return { user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
