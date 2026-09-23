import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEvent } from "@/lib/auth-diagnostics";

// Module-level session store shared by every `useSession()` consumer. There is
// exactly ONE `getSession` call and ONE `onAuthStateChange` subscription for
// the lifetime of the app, no matter how many components call the hook.
// Externally, each consumer still sees its own up-to-date `{ session, user,
// loading }` snapshot, matching the previous per-consumer-subscription
// behavior.

type Listener = () => void;

let currentSession: Session | null = null;
let currentLoading = true;
let initialized = false;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  supabase.auth.getSession().then(({ data }) => {
    currentSession = data.session;
    currentLoading = false;
    logAuthEvent("getSession:result", { hasSession: Boolean(data.session) });
    notify();
  });

  supabase.auth.onAuthStateChange((event, next) => {
    logAuthEvent("onAuthStateChange", { event, hasSession: Boolean(next) });
    currentSession = next;
    currentLoading = false;
    notify();
  });
}

export function useSession() {
  ensureInitialized();
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener: Listener = () => forceRender((n) => n + 1);
    listeners.add(listener);
    // Re-sync in case the shared state changed between render and mount.
    forceRender((n) => n + 1);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { session: currentSession, user: currentSession?.user ?? null, loading: currentLoading };
}

export type { User };
