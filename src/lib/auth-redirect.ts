/**
 * Canonical Google OAuth redirect URI.
 *
 * MUST always resolve to the site origin — never a per-route callback path
 * (e.g. `${origin}/dashboard`). All Google sign-in call sites (initial
 * sign-in, destructive-action reauthentication, ...) must use this single
 * helper so the OAuth provider always redirects back to a consistent,
 * app-wide entry point.
 */
export function getAuthRedirectUri(): string {
  return window.location.origin;
}
