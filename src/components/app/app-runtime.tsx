import { useEffect, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

import { DiceProvider } from "@/components/app/dice-context";
import { PwaRegister } from "@/components/app/pwa-register";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/auth-diagnostics";
import { createAuthInvalidationHandler } from "@/lib/app-runtime";
import { diagTrace } from "@/lib/diag-modes";

/**
 * Global application runtime: the shared auth-state listener, obsolete
 * service-worker retirement and the dice runtime.
 *
 * Mounted on application routes only. The public `/auth` route renders the
 * minimal shell (query + i18n + tooltip + toaster) so that merely opening the
 * sign-in page starts no background systems.
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
    // The key is the signed-in identity, not the token: a renewed token for
    // the same person is not a reason to refetch the whole app.
    const keyOf = (session: { user?: { id?: string } | null } | null) =>
      session?.user?.id ? session.user.id : null;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      logAuthEvent("auth:event", { event, hasSession: Boolean(session) });
      handler.handle(event, keyOf(session));
    });
    diagTrace(trace, "auth listener subscribed");

    // The session this page loaded with is already reflected on screen.
    void supabase.auth
      .getSession()
      .then(({ data }) => handler.prime(keyOf(data.session)))
      .catch(() => undefined);

    return () => {
      handler.dispose();
      sub.subscription.unsubscribe();
    };
  }, [router, queryClient, skipAuthListener, trace]);

  return (
    <DiceProvider>
      <PwaRegister skipCleanup={skipPwaCleanup} trace={trace} />
      {children}
    </DiceProvider>
  );
}
