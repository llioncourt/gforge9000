/**
 * App-owned browser Google sign-in helper.
 *
 * ROOT CAUSE (confirmed by tracing + a real click in a headless browser):
 * the previous path used `@lovable.dev/cloud-auth-js`
 * (`src/integrations/lovable/index.ts`), whose `signInWithOAuth()` navigates
 * the top-level page to a RELATIVE broker URL, `/~oauth/initiate` (see
 * `node_modules/@lovable.dev/cloud-auth-js/dist/index.js`). That path only
 * exists on Lovable's own hosted preview/production proxy. On this app's own
 * origin (e.g. local dev, or any deploy target where that proxy isn't in
 * front of the app) it 404s, so the browser never reaches Google, no tokens
 * ever come back, and `supabase.auth.setSession()` is never called — so no
 * `SIGNED_IN` event and no local session are ever created. That matches the
 * reported symptom exactly (failed attempts create no fresh session) and was
 * confirmed by observing the real navigation target on click:
 * `http://<origin>/~oauth/initiate?provider=google&...` -> 404.
 *
 * FIX: let Supabase's own native Google provider own the redirect and the
 * callback/session exchange (`supabase.auth.signInWithOAuth`), instead of
 * going through the Lovable broker. Both normal sign-in (`/auth`) and
 * destructive-action reauthentication (`profile-menu.tsx` via `reauth.ts`)
 * must call this single helper so there is exactly one code path.
 */

import { supabase } from "@/integrations/supabase/client";
import { getAuthRedirectUri } from "@/lib/auth-redirect";
import { logAuthEvent } from "@/lib/auth-diagnostics";

export type GoogleSignInResult = { error: Error | null };

/**
 * Starts native Supabase Google OAuth. On success this performs a full-page
 * redirect (the promise "succeeding" here only means the redirect was
 * initiated) — control does not return to the caller in that case. On
 * failure (e.g. provider misconfigured) it resolves with an error and does
 * NOT navigate away.
 */
export async function signInWithGoogle(reason?: string): Promise<GoogleSignInResult> {
  logAuthEvent("oauth:start", { provider: "google", reason: reason ?? null });
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: getAuthRedirectUri() },
  });
  if (error) {
    logAuthEvent("oauth:initiate-error", { provider: "google", reason: reason ?? null });
    return { error };
  }
  // supabase-js redirects the browser itself (window.location.assign) when
  // it succeeds, so this line is normally never reached before navigation.
  logAuthEvent("oauth:redirected", { provider: "google", reason: reason ?? null });
  return { error: null };
}

const OAUTH_ERROR_PARAMS = ["error", "error_description", "error_code"];

/**
 * Detects a failed/expired OAuth provider return on the current URL (either
 * in the query string or the hash fragment, since Supabase implicit-flow
 * errors land in the hash). Returns a human-readable message, or `null` if
 * there is no error to report. Does not mutate the URL.
 */
export function readOAuthReturnError(location: Pick<Location, "search" | "hash">): string | null {
  const search = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  for (const key of OAUTH_ERROR_PARAMS) {
    const value = search.get(key) ?? hash.get(key);
    if (value) {
      logAuthEvent("oauth:return-error", { param: key });
      return search.get("error_description") ?? hash.get("error_description") ?? value;
    }
  }
  return null;
}
