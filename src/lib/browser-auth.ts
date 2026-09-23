/**
 * App-owned browser Google sign-in helper.
 *
 * ROOT CAUSE (confirmed against the PUBLISHED site, not a local guess):
 * `https://<supabase-ref>.supabase.co/auth/v1/authorize?provider=google`
 * answers `400 validation_failed — "Unsupported provider: missing OAuth
 * secret"`. The project's own Supabase Google provider has NO client
 * id/secret, so any call to `supabase.auth.signInWithOAuth({provider:
 * "google"})` fails with HTTP 400 *before* the browser can reach
 * accounts.google.com. That is exactly the production symptom reported.
 *
 * The managed Google credentials live with the hosted platform, not with the
 * project's Supabase instance, and are reached through the hosted initiate
 * path. Verified live: that path answers `302` to the hosted OAuth service on
 * BOTH the published site and the preview site. The earlier "the broker path
 * 404s" conclusion was a LOCAL-ONLY artifact (that path is served by the
 * hosting layer, which is absent in the sandbox) and did not reflect
 * production.
 *
 * FIX: browser Google sign-in goes back through the managed helper, which
 * owns initiation, the provider popup/redirect, and the token handoff into
 * `supabase.auth.setSession()`. Normal login and destructive-action
 * reauthentication both call THIS single helper — there is exactly one path.
 *
 * Password sign-in is unaffected and never touches this module.
 */

import { lovable } from "@/integrations/lovable";
import { getAuthRedirectUri } from "@/lib/auth-redirect";
import { logAuthEvent } from "@/lib/auth-diagnostics";

export type GoogleSignInResult = { error: Error | null };

/**
 * Starts managed Google OAuth against the canonical site origin. Either the
 * browser is redirected to the provider (control does not return), or the
 * tokens come back and the session is already set when this resolves. On
 * failure it resolves with an error and does NOT navigate away.
 */
export async function signInWithGoogle(reason?: string): Promise<GoogleSignInResult> {
  logAuthEvent("oauth:start", { provider: "google", reason: reason ?? null });
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: getAuthRedirectUri(),
  });
  if (result.error) {
    logAuthEvent("oauth:initiate-error", { provider: "google", reason: reason ?? null });
    return { error: result.error instanceof Error ? result.error : new Error(String(result.error)) };
  }
  logAuthEvent("oauth:redirected", {
    provider: "google",
    reason: reason ?? null,
    redirected: Boolean((result as { redirected?: boolean }).redirected),
  });
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
