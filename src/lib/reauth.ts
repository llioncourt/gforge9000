/**
 * Recent-authentication check for destructive actions.
 *
 * SECURITY STATUS — READ BEFORE CHANGING
 * --------------------------------------
 * The account wipe is executed by the `public.wipe_all_my_data()` database
 * function, which today only checks `auth.uid() IS NOT NULL`. That means the
 * *server* accepts the call from ANY valid session, no matter how old. The
 * re-confirmation in the UI is therefore a deliberate, honest speed bump —
 * it is NOT a server-enforced security boundary, and no UI copy may claim
 * otherwise.
 *
 * What this module fixes: the previous implementation authorised the final
 * step from a plain `sessionStorage` timestamp, which any script could write.
 * Authorisation now comes from the signed access token itself: the `amr`
 * (authentication methods reference) and `auth_time`/`iat` claims that
 * Supabase issues. A client cannot forge those without forging the token.
 * A fresh email/password sign-in mints a fresh token, which is how a user
 * re-qualifies for the destructive action.
 *
 * Making this a REAL boundary requires changing the database function so it
 * inspects the same claims server-side. That change is intentionally NOT
 * applied here; see the proposal in `docs/security/wipe-reauth.md`.
 */

/** How fresh an authentication has to be to unlock a destructive action. */
export const REAUTH_MAX_AGE_SECONDS = 5 * 60;

interface JwtClaims {
  iat?: number;
  auth_time?: number;
  amr?: { method?: string; timestamp?: number }[];
}

/** Decodes the (public, unverified) payload of a JWT. Never logs it. */
export function decodeJwtClaims(accessToken: string | null | undefined): JwtClaims | null {
  if (!accessToken) return null;
  const part = accessToken.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JwtClaims;
  } catch {
    return null;
  }
}

/**
 * Seconds since the most recent authentication recorded in the token, or
 * `null` when the token carries no usable signal (fail closed).
 */
export function authAgeSeconds(
  accessToken: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const claims = decodeJwtClaims(accessToken);
  if (!claims) return null;
  const stamps: number[] = [];
  for (const entry of claims.amr ?? []) {
    if (typeof entry?.timestamp === "number") stamps.push(entry.timestamp);
  }
  if (typeof claims.auth_time === "number") stamps.push(claims.auth_time);
  if (!stamps.length && typeof claims.iat === "number") stamps.push(claims.iat);
  if (!stamps.length) return null;
  const newest = Math.max(...stamps);
  return Math.max(0, Math.floor(nowMs / 1000) - newest);
}

/** True only when the signed token proves a sufficiently recent sign-in. */
export function hasRecentAuth(
  accessToken: string | null | undefined,
  nowMs: number = Date.now(),
  maxAgeSeconds: number = REAUTH_MAX_AGE_SECONDS,
): boolean {
  const age = authAgeSeconds(accessToken, nowMs);
  if (age === null) return false;
  return age <= maxAgeSeconds;
}
