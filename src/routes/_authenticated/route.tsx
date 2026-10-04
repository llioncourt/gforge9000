import { Suspense } from "react";
import {
  createFileRoute,
  Outlet,
  redirect,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/app-shell";
import {
  AppBootScreen,
  AppContentLoading,
  SessionUnavailableScreen,
} from "@/components/app/session-screens";
import { decideProtectedAccess } from "@/lib/auth-guard";
import { markAuthBounce } from "@/lib/auth-landing";
import { SessionUnavailableError, isSessionUnavailableError } from "@/lib/session-unavailable";

/**
 * Only the "session could not be checked" case is handled here. Every other
 * failure is rethrown so it keeps reaching the root error screen as before.
 */
function ProtectedAreaError({ error }: ErrorComponentProps) {
  if (!isSessionUnavailableError(error)) throw error;
  return <SessionUnavailableScreen reason={error.reason} />;
}

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async () => {
    const decision = await decideProtectedAccess({
      getSession: () => supabase.auth.getSession(),
      getUser: () => supabase.auth.getUser(),
    });

    if (decision.outcome === "redirect") {
      // Tells the sign-in page this visit was refused, so it stays put.
      markAuthBounce();
      throw redirect({ to: "/auth" });
    }

    if (decision.outcome === "unavailable") {
      throw new SessionUnavailableError(decision.reason);
    }

    return { user: decision.user };
  },
  // Rendered instead of an empty page while the session is checked and the
  // first screen loads.
  pendingComponent: AppBootScreen,
  errorComponent: ProtectedAreaError,
  component: () => (
    <AppShell>
      {/* A screen whose code is still arriving only fills the content area;
          the menu and top bar stay on screen. */}
      <Suspense fallback={<AppContentLoading />}>
        <Outlet />
      </Suspense>
    </AppShell>
  ),
});
