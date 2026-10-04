import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

/**
 * The signed-in user, read from the session already held on this device.
 *
 * Use this when only the user's id is needed to fill a column or build a file
 * path before a write. `supabase.auth.getUser()` answers the same question by
 * calling the auth service, which put one extra network round-trip in front of
 * every save, upload and dice roll. Nothing is trusted because of this value:
 * the database's row policies still decide what the caller may write.
 *
 * The result has the same shape as `getUser()` so call sites read the same.
 * An expired token is renewed by the session read itself; with no session the
 * user is `null`, exactly as before.
 */
export async function currentUser(): Promise<{ data: { user: User | null } }> {
  const { data } = await supabase.auth.getSession();
  return { data: { user: data.session?.user ?? null } };
}
