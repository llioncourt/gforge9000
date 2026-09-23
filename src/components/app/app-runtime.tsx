import { useEffect, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { PwaRegister } from "@/components/app/pwa-register";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/auth-diagnostics";
import { createAuthInvalidationHandler } from "@/lib/app-runtime";
import { diagTrace } from "@/lib/diag-modes";

/**
 * Global application runtime: the shared auth-state listener and obsolete
 * service-worker retirement. (The dice provider lives in the root route so it
 * stays mounted across every navigation — including transitions toward
 * `/auth`, where the outgoing tree may still call `useDice`.)
 *
 * Mounted on application routes only. The public `/auth` route renders the
 * minimal shell (query + i18n + tooltip + dice + toaster) so that merely
 * opening the sign-in page starts no background systems.
 */
export function AppRuntime({
  queryClient,
  skipAuthListener = false,
  skipPwaCleanup = false,
  trace = false,
  children,
}: {
  queryClient: QueryClient;
  skipAuthListener?: boolean;
  skipPwaCleanup?: boolean;
  trace?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (skipAuthListener) return;

    const handler = createAuthInvalidationHandler({
      invalidateRouter: () => router.invalidate(),
      invalidateQueries: () => queryClient.invalidateQueries(),
      schedule: (run) => setTimeout(run, 0),
      cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      trace: trace ? (event) => diagTrace(true, event) : undefined,
    });

    // The callback runs inside the auth client's notification lock, so it must
    // stay synchronous and only schedule work.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      logAuthEvent("auth:event", { event, hasSession: Boolean(session) });
      const key = session ? `${session.user?.id ?? ""}:${session.expires_at ?? ""}` : null;
      handler.handle(event, key);
    });
    diagTrace(trace, "auth listener subscribed");

    return () => {
      handler.dispose();
      sub.subscription.unsubscribe();
    };
  }, [router, queryClient, skipAuthListener, trace]);

  return (
    <>
      <PwaRegister skipCleanup={skipPwaCleanup} trace={trace} />
      {children}
    </>
  );
}
