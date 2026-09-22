import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth/auth-provider";

/**
 * Thin read of the single authentication owner. It registers no listener and
 * performs no session read of its own.
 */
export function useSession() {
  const { session, status } = useAuth();
  return { session, user: session?.user ?? null, loading: status === "checking" };
}

export type { User };
